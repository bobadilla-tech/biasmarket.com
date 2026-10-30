import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@biasmarket/db';
import type { PaymentMethodType } from '@biasmarket/db';
import {
  computePaymentSummary,
  type SummablePayment,
} from '../../../common/payment-summary.js';
import {
  hasForbiddenChars,
  isNoteTooLong,
  normalizeOperationCode,
  normalizeOperationCodeForStorage,
  NOTE_TOO_LONG_MESSAGE,
  sanitizeDisplayText,
} from '../../../common/text-sanitize.js';
import type { ValidatedUploadedFile } from '../../../common/uploaded-file-validation.pipe.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { StorageService } from '../../../storage/storage.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { RESERVED_HOLD_STATUSES } from '../domain/hold-statuses.js';
import { OrderEventsService } from './order-events.service.js';

const PAYMENT_METHODS: PaymentMethodType[] = [
  'YAPE',
  'PLIN',
  'TRANSFER',
  'CASH',
];

type MoneyValue = string | number | Prisma.Decimal;

// Digits with at most two decimals, never exponent/hex/sign/whitespace.
const AMOUNT_PATTERN = /^\d{1,9}(\.\d{1,2})?$/;
const MAX_OPERATION_CODE_LENGTH = 64;
// A balance reservation alone does not bound the number of proofs (a 100.00
// balance admits 10,000 one-cent proofs), so the count is capped as well.
export const MAX_PENDING_BUYER_PROOFS = 5;

/**
 * Order snapshot the caller already authorized (session lookup or token
 * guard). It feeds the pre-checks only: the locked transaction re-reads the
 * order and its payments, because this copy is stale by then.
 */
export type BuyerProofOrder = {
  id: string;
  storeId: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  expiresAt: Date | null;
  requiredAmount: MoneyValue;
  currency: string;
  payments: {
    amount: MoneyValue;
    source: string;
    reviewStatus: string;
    voidedAt?: Date | null;
  }[];
};

export type SubmitBuyerProofInput = {
  order: BuyerProofOrder;
  file: ValidatedUploadedFile;
  amount: unknown;
  method: unknown;
  note: unknown;
  operationCode?: unknown;
};

type OrderState = Pick<
  BuyerProofOrder,
  'status' | 'paymentStatus' | 'fulfillmentStatus' | 'expiresAt'
>;

function toCents(value: MoneyValue): number {
  return new Prisma.Decimal(value).times(100).toDecimalPlaces(0).toNumber();
}

function asSummable(payments: BuyerProofOrder['payments']): SummablePayment[] {
  return payments.map((payment) => ({
    amount: new Prisma.Decimal(payment.amount),
    source: payment.source as SummablePayment['source'],
    reviewStatus: payment.reviewStatus as SummablePayment['reviewStatus'],
    voidedAt: payment.voidedAt ?? null,
  }));
}

function isPendingProof(payment: BuyerProofOrder['payments'][number]) {
  return payment.voidedAt == null && payment.reviewStatus === 'PENDING_REVIEW';
}

function pendingProofCents(payments: BuyerProofOrder['payments']) {
  return payments
    .filter(isPendingProof)
    .reduce((sum, payment) => sum + toCents(payment.amount), 0);
}

function pendingBuyerProofCount(payments: BuyerProofOrder['payments']) {
  return payments.filter(
    (payment) =>
      isPendingProof(payment) && payment.source === 'BUYER_SUBMITTED',
  ).length;
}

/** Rejects states that do not accept proofs. Same rules for both phases. */
function assertAcceptsProofs(
  state: OrderState,
  pendingAmount: number,
  now: Date,
) {
  if (state.status === 'CANCELLED' || state.paymentStatus === 'CANCELLED') {
    throw new BadRequestException(
      'No se pueden enviar comprobantes en una orden cancelada',
    );
  }
  if (state.paymentStatus === 'REJECTED') {
    throw new BadRequestException(
      'No se pueden enviar comprobantes en una orden rechazada',
    );
  }
  // Only a VERIFIED order with its balance settled is closed to new proofs —
  // a VERIFIED order with a residual balance (approved on a deposit, or a
  // legacy pre-guard approval) still owes money and must accept the rest.
  // Mirrors `OrderController.addPayment` and the frontend `paymentsLocked`.
  if (state.paymentStatus === 'VERIFIED' && pendingAmount <= 0) {
    throw new BadRequestException('La orden ya está pagada');
  }
  // Keep in sync with the web `canSubmitProof` (fulfillment must be ORDERING).
  if (
    state.fulfillmentStatus === 'IN_TRANSIT' ||
    state.fulfillmentStatus === 'READY' ||
    state.fulfillmentStatus === 'COMPLETED'
  ) {
    throw new BadRequestException(
      'No se pueden enviar comprobantes en una orden enviada',
    );
  }
  // Expired but not yet swept: the hold is over, the order only looks alive.
  if (
    state.status === 'ACTIVE' &&
    (RESERVED_HOLD_STATUSES as readonly string[]).includes(
      state.paymentStatus,
    ) &&
    state.expiresAt != null &&
    state.expiresAt.getTime() < now.getTime()
  ) {
    throw new BadRequestException('El pedido venció');
  }
}

function parseAmount(amount: unknown): { cents: number; value: string } {
  if (typeof amount !== 'string' || !AMOUNT_PATTERN.test(amount)) {
    throw new BadRequestException('Monto inválido');
  }
  const cents = toCents(amount);
  if (cents < 1) throw new BadRequestException('Monto inválido');
  return { cents, value: amount };
}

function parseOperationCode(value: unknown): string | null {
  if (value == null) return null;
  const invalid = () => new BadRequestException('Código de operación inválido');
  if (typeof value !== 'string') throw invalid();
  if (value.trim() === '') return null;
  if (hasForbiddenChars(value)) throw invalid();
  const stored = normalizeOperationCodeForStorage(value);
  if (stored.length > MAX_OPERATION_CODE_LENGTH) throw invalid();
  if (normalizeOperationCode(stored) === '') throw invalid();
  return stored;
}

/**
 * Buyer-submitted proof of payment, shared by the session route
 * (`CustomerOrderPaymentsController`) and the token route
 * (`PublicOrderEventsController`). Callers own authorization; this owns input
 * validation, state checks, the upload, the locked insert, the
 * `PAYMENT_SUBMITTED` event and the seller notification.
 *
 * Never put the operation code, the note, the original file name, the IP or
 * the user agent in the event, the notification or any log.
 */
@Injectable()
export class BuyerPaymentProofService {
  private readonly logger = new Logger(BuyerPaymentProofService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private notifications: NotificationsService,
    private events: OrderEventsService,
  ) {}

  async submit({
    order,
    file,
    amount,
    method,
    note,
    operationCode,
  }: SubmitBuyerProofInput) {
    if (note != null && typeof note !== 'string') {
      throw new BadRequestException('Nota inválida');
    }
    if (isNoteTooLong(note)) {
      throw new BadRequestException(NOTE_TOO_LONG_MESSAGE);
    }
    const storedOperationCode = parseOperationCode(operationCode);
    const parsed = parseAmount(amount);
    const storedNote = sanitizeDisplayText(note as string | undefined);

    const summary = computePaymentSummary(
      new Prisma.Decimal(order.requiredAmount),
      asSummable(order.payments),
    );
    assertAcceptsProofs(order, summary.pendingAmount, new Date());
    if (
      parsed.cents >
      toCents(summary.pendingAmount) - pendingProofCents(order.payments)
    ) {
      throw new BadRequestException('El monto excede el saldo pendiente');
    }
    if (pendingBuyerProofCount(order.payments) >= MAX_PENDING_BUYER_PROOFS) {
      throw new BadRequestException(
        'Ya hay comprobantes pendientes de revisión, espera a que la tienda los revise',
      );
    }
    if (
      typeof method !== 'string' ||
      !PAYMENT_METHODS.includes(method as PaymentMethodType)
    ) {
      throw new BadRequestException('Selecciona un método de pago');
    }

    const imageUrl = await this.storage.uploadPaymentImage(
      file.buffer,
      file.detectedMimeType,
    );

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Row-lock the order so concurrent submissions serialize instead of
        // all passing the re-check below on the same pre-commit snapshot
        // (READ COMMITTED does not see uncommitted rows). The second
        // transaction blocks here until the first commits, then its re-read
        // sees the first's PENDING_REVIEW row. Same pattern as
        // create-order.usecase.ts's stock-hold lock.
        const [locked] = await tx.$queryRaw<
          Array<{ id: string }>
        >`SELECT id FROM "Order" WHERE id = ${order.id} AND "storeId" = ${order.storeId} FOR UPDATE`;
        if (!locked) {
          throw new NotFoundException('Orden no encontrada');
        }

        // The copy handed in by the caller is stale: cancel, expiry or a
        // review may have committed since. Re-read everything the rules use.
        const current = await tx.order.findFirst({
          where: { id: order.id, storeId: order.storeId },
          select: {
            status: true,
            paymentStatus: true,
            fulfillmentStatus: true,
            expiresAt: true,
            requiredAmount: true,
          },
        });
        if (!current) {
          throw new NotFoundException('Orden no encontrada');
        }
        const payments = await tx.orderPayment.findMany({
          where: { orderId: order.id, storeId: order.storeId },
          select: {
            amount: true,
            source: true,
            reviewStatus: true,
            voidedAt: true,
          },
        });
        const lockedSummary = computePaymentSummary(
          new Prisma.Decimal(current.requiredAmount),
          asSummable(payments),
        );
        assertAcceptsProofs(current, lockedSummary.pendingAmount, new Date());
        const availableCents =
          toCents(lockedSummary.pendingAmount) - pendingProofCents(payments);
        if (parsed.cents > availableCents) {
          throw new BadRequestException('El monto excede el saldo pendiente');
        }
        if (pendingBuyerProofCount(payments) >= MAX_PENDING_BUYER_PROOFS) {
          throw new BadRequestException(
            'Ya hay comprobantes pendientes de revisión, espera a que la tienda los revise',
          );
        }

        const created = await tx.orderPayment.create({
          data: {
            orderId: order.id,
            storeId: order.storeId,
            amount: new Prisma.Decimal(parsed.value),
            currency: order.currency,
            method: method as PaymentMethodType,
            note: storedNote,
            operationCode: storedOperationCode,
            imageUrl,
            source: 'BUYER_SUBMITTED',
            reviewStatus: 'PENDING_REVIEW',
            paidAt: null,
          },
        });
        await this.events.record(tx, {
          orderId: order.id,
          storeId: order.storeId,
          type: 'PAYMENT_SUBMITTED',
          actor: 'BUYER',
          // Keys are pinned by a test: no code, note or file metadata.
          payload: {
            paymentId: created.id,
            amount: Number(parsed.value),
            method,
          },
        });
        // Dedups against an already-open notification for this order (see
        // NotificationsService.createIfNotOpen).
        await this.notifications.createIfNotOpen(
          {
            storeId: order.storeId,
            type: 'PAYMENT_PROOF_SUBMITTED',
            entityType: 'Order',
            entityId: order.id,
            title: 'Comprobante de pago recibido',
            body: `El comprador envió un comprobante de ${order.currency} ${Number(
              parsed.value,
            )} para revisar.`,
          },
          tx,
        );
        return created;
      });
    } catch (error) {
      // The object was uploaded before the transaction; do not leave it
      // orphaned. Best effort, and the URL is not logged.
      await this.storage.deleteImage(imageUrl).catch(() => {
        this.logger.warn(
          `Failed to delete an orphaned proof upload for order ${order.id}`,
        );
      });
      throw error;
    }
  }
}
