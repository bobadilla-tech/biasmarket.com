import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { PaymentMethodType } from '@biasmarket/db';
import { countsTowardPaid } from '../../../common/payment-summary.js';
import type { ValidatedUploadedFile } from '../../../common/uploaded-file-validation.pipe.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { StorageService } from '../../../storage/storage.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { OrderEventsService } from './order-events.service.js';

const PAYMENT_METHODS: PaymentMethodType[] = [
  'YAPE',
  'PLIN',
  'TRANSFER',
  'CASH',
];

/**
 * Order snapshot the caller already authorized (session lookup or token
 * guard). Used for pre-checks only: the locked transaction re-reads what it
 * depends on.
 */
export type BuyerProofOrder = {
  id: string;
  storeId: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  requiredAmount: unknown;
  currency: string;
  pendingAmount: number;
  payments: {
    amount: unknown;
    source?: string;
    reviewStatus: string;
    voidedAt?: Date | null;
  }[];
};

export type SubmitBuyerProofInput = {
  order: BuyerProofOrder;
  file: ValidatedUploadedFile;
  amount: string;
  method: string;
  note: string | undefined;
};

/**
 * Buyer-submitted proof of payment, shared by the session route
 * (`CustomerOrderPaymentsController`) and, later, the token route. Callers own
 * authorization; this owns state checks, the upload, the locked insert, the
 * `PAYMENT_SUBMITTED` event and the seller notification.
 */
@Injectable()
export class BuyerPaymentProofService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private notifications: NotificationsService,
    private events: OrderEventsService,
  ) {}

  async submit({ order, file, amount, method, note }: SubmitBuyerProofInput) {
    if (order.paymentStatus === 'CANCELLED') {
      throw new BadRequestException(
        'No se pueden enviar comprobantes en una orden cancelada',
      );
    }
    if (order.paymentStatus === 'REJECTED') {
      throw new BadRequestException(
        'No se pueden enviar comprobantes en una orden rechazada',
      );
    }
    // Only a VERIFIED order with its balance settled is closed to new proofs —
    // a VERIFIED order with a residual balance (approved on a deposit, or a
    // legacy pre-guard approval) still owes money and must accept the rest.
    // Mirrors `OrderController.addPayment` and the frontend `paymentsLocked`.
    if (
      order.paymentStatus === 'VERIFIED' &&
      Number(order.pendingAmount) <= 0
    ) {
      throw new BadRequestException('La orden ya está pagada');
    }
    if (
      order.fulfillmentStatus === 'IN_TRANSIT' ||
      order.fulfillmentStatus === 'READY' ||
      order.fulfillmentStatus === 'COMPLETED'
    ) {
      throw new BadRequestException(
        'No se pueden enviar comprobantes en una orden enviada',
      );
    }

    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      throw new BadRequestException('Monto inválido');
    }
    const toCents = (n: number) => Math.round(n * 100);
    // Enforce the remaining balance against BOTH already-credited amounts
    // (pendingAmount) and already-submitted PENDING_REVIEW proofs (the
    // "reserve"). A pending proof doesn't count toward paidAmount yet, so
    // ignoring it lets a duplicate full-balance submission waste an image
    // upload before the in-transaction re-check rejects it. The transaction
    // below is the authoritative, atomic guard; this pre-check just rejects
    // the obvious sequential case early.
    const reservedCents = (order.payments ?? [])
      .filter((p) => p.reviewStatus === 'PENDING_REVIEW')
      .reduce((sum, p) => sum + toCents(Number(p.amount)), 0);
    if (toCents(numericAmount) > toCents(order.pendingAmount) - reservedCents) {
      throw new BadRequestException('El monto excede el saldo pendiente');
    }
    if (!method || !PAYMENT_METHODS.includes(method as PaymentMethodType)) {
      throw new BadRequestException('Selecciona un método de pago');
    }
    const imageUrl = await this.storage.uploadPaymentImage(
      file.buffer,
      file.detectedMimeType,
    );

    const payment = await this.prisma.$transaction(async (tx) => {
      // Row-lock the order so two concurrent submissions serialize instead of
      // both passing the re-check below on the same pre-commit snapshot.
      // Without the lock, both transactions' `findMany` can run before either
      // commits (READ COMMITTED doesn't see uncommitted rows), each computes
      // the full balance as available, and both insert — over-submitting the
      // order. The second transaction blocks here until the first commits,
      // then its re-read sees the first's committed PENDING_REVIEW row and
      // the reserve is respected. Same pattern as create-order.usecase.ts's
      // stock-hold lock.
      const [locked] = await tx.$queryRaw<
        Array<{ id: string }>
      >`SELECT id FROM "Order" WHERE id = ${order.id} FOR UPDATE`;
      if (!locked) {
        throw new NotFoundException('Orden no encontrada');
      }

      // Re-check the balance inside the transaction. Under the lock this read
      // is guaranteed to see any earlier submission's committed PENDING_REVIEW
      // row, so the available balance (credited + reserved) is authoritative.
      const payments = await tx.orderPayment.findMany({
        where: { orderId: order.id },
        select: {
          amount: true,
          source: true,
          reviewStatus: true,
          voidedAt: true,
        },
      });
      const creditedCents = payments
        .filter(countsTowardPaid)
        .reduce((sum, p) => sum + toCents(Number(p.amount)), 0);
      const reservedCents = payments
        .filter(
          (p) => p.voidedAt == null && p.reviewStatus === 'PENDING_REVIEW',
        )
        .reduce((sum, p) => sum + toCents(Number(p.amount)), 0);
      const availableCents =
        toCents(Number(order.requiredAmount)) - creditedCents - reservedCents;
      if (toCents(numericAmount) > availableCents) {
        throw new BadRequestException('El monto excede el saldo pendiente');
      }

      const created = await tx.orderPayment.create({
        data: {
          orderId: order.id,
          storeId: order.storeId,
          amount: numericAmount,
          currency: order.currency,
          method: method as PaymentMethodType,
          note,
          imageUrl,
          source: 'BUYER_SUBMITTED',
          reviewStatus: 'PENDING_REVIEW',
        },
      });
      await this.events.record(tx, {
        orderId: order.id,
        storeId: order.storeId,
        type: 'PAYMENT_SUBMITTED',
        actor: 'BUYER',
        payload: {
          paymentId: created.id,
          amount: numericAmount,
          method,
        },
      });
      // Dedups against an already-open notification for this order (see
      // NotificationsService.createIfNotOpen) — a buyer re-submitting a
      // second proof before the seller reviews the first one doesn't spam a
      // second notification, same semantics stock alerts already rely on.
      await this.notifications.createIfNotOpen(
        {
          storeId: order.storeId,
          type: 'PAYMENT_PROOF_SUBMITTED',
          entityType: 'Order',
          entityId: order.id,
          title: 'Comprobante de pago recibido',
          body: `El comprador envió un comprobante de ${order.currency} ${numericAmount} para revisar.`,
        },
        tx,
      );
      return created;
    });

    return payment;
  }
}
