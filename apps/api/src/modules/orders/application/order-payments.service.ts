import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../../prisma/prisma.service.js";
import {
  hasForbiddenChars,
  normalizeOperationCode,
  normalizeOperationCodeForStorage,
} from "../../../common/text-sanitize.js";

const PAYMENT_METHODS = ["YAPE", "PLIN", "TRANSFER", "CASH"] as const;
export type SellerPaymentMethod = (typeof PAYMENT_METHODS)[number];

// Digits with at most two decimals, never exponent/hex/sign/whitespace.
const AMOUNT_PATTERN = /^\d{1,9}(\.\d{1,2})?$/;
// ISO 8601 date-time WITH an offset or `Z`: a date-only value would parse as
// UTC midnight and land on the previous day in Lima.
const ISO_WITH_OFFSET =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;
const MAX_OPERATION_CODE_LENGTH = 64;
const PAID_AT_SKEW_MS = 5 * 60_000;

export type SellerPaymentInput = {
  amount: unknown;
  method: unknown;
  operationCode?: unknown;
  paidAt?: unknown;
  confirmDuplicate?: unknown;
  hasCapture: boolean;
};

export type ValidSellerPayment = {
  amount: string;
  amountCents: number;
  method: SellerPaymentMethod;
  /** Stored form (NFKC + trim), or null when blank. */
  operationCode: string | null;
  paidAt: Date;
  confirmDuplicate: boolean;
};

/**
 * Pure validation of a seller-recorded payment's fields, before anything is
 * looked up or uploaded. Every failure is a 400 with a Spanish message.
 */
export function assertSellerPaymentInput(
  input: SellerPaymentInput,
  now: Date = new Date(),
): ValidSellerPayment {
  if (typeof input.amount !== "string" || !AMOUNT_PATTERN.test(input.amount)) {
    throw new BadRequestException("Monto inválido");
  }
  const amountCents = Math.round(Number(input.amount) * 100);
  if (amountCents < 1) throw new BadRequestException("Monto inválido");

  if (
    typeof input.method !== "string" ||
    !(PAYMENT_METHODS as readonly string[]).includes(input.method)
  ) {
    throw new BadRequestException("Selecciona un método de pago");
  }
  const method = input.method as SellerPaymentMethod;
  if (method !== "CASH" && !input.hasCapture) {
    throw new BadRequestException("Adjunta la captura del pago");
  }

  let operationCode: string | null = null;
  if (input.operationCode != null) {
    const invalid = () =>
      new BadRequestException("Código de operación inválido");
    if (typeof input.operationCode !== "string") throw invalid();
    if (input.operationCode.trim() !== "") {
      if (hasForbiddenChars(input.operationCode)) throw invalid();
      const stored = normalizeOperationCodeForStorage(input.operationCode);
      if (stored.length > MAX_OPERATION_CODE_LENGTH) throw invalid();
      // "---" or "ÁÉ" would normalize to '' and match every symbol-only code.
      if (normalizeOperationCode(stored) === "") throw invalid();
      operationCode = stored;
    }
  }

  let paidAt = now;
  if (input.paidAt != null && input.paidAt !== "") {
    const invalid = () => new BadRequestException("Fecha de pago inválida");
    if (
      typeof input.paidAt !== "string" ||
      !ISO_WITH_OFFSET.test(input.paidAt)
    ) {
      throw invalid();
    }
    const parsed = new Date(input.paidAt);
    if (Number.isNaN(parsed.getTime())) throw invalid();
    if (parsed.getTime() > now.getTime() + PAID_AT_SKEW_MS) {
      throw new BadRequestException("La fecha de pago no puede ser futura");
    }
    paidAt = parsed;
  }

  return {
    amount: input.amount,
    amountCents,
    method,
    operationCode,
    paidAt,
    confirmDuplicate: input.confirmDuplicate === "true",
  };
}

const toCents = (n: number | string | { toString(): string }) =>
  Math.round(Number(n.toString()) * 100);

/** Cents held by buyer proofs that are still waiting for review. */
export function reservedPendingCents(
  payments: {
    amount: { toString(): string } | number | string;
    reviewStatus: string;
    voidedAt?: Date | null;
  }[],
): number {
  return payments
    .filter((p) => p.voidedAt == null && p.reviewStatus === "PENDING_REVIEW")
    .reduce((sum, p) => sum + toCents(p.amount), 0);
}

/** Rejects states where the seller can no longer record a payment. */
export function assertAcceptsSellerPayments(state: {
  status?: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  pendingAmount: number;
}) {
  if (state.status === "CANCELLED" || state.paymentStatus === "CANCELLED") {
    throw new BadRequestException(
      "No se pueden registrar abonos en una orden cancelada",
    );
  }
  if (state.paymentStatus === "REJECTED") {
    throw new BadRequestException(
      "No se pueden registrar abonos en una orden rechazada",
    );
  }
  // A VERIFIED order only closes to further payments once its balance is
  // actually settled. Approving on a deposit (or a legacy pre-guard order
  // approved with zero money) leaves `pendingAmount > 0`, and the seller must
  // be able to keep registering the remainder — mirrors the frontend
  // `paymentsLocked` rule (features/orders/lib/order-status.ts).
  if (state.paymentStatus === "VERIFIED" && state.pendingAmount <= 0) {
    throw new BadRequestException("La orden ya está pagada");
  }
  if (
    state.fulfillmentStatus === "IN_TRANSIT" ||
    state.fulfillmentStatus === "READY" ||
    state.fulfillmentStatus === "COMPLETED"
  ) {
    throw new BadRequestException(
      "No se pueden registrar abonos en una orden enviada",
    );
  }
}

/**
 * The payment must fit in `pending - reserved`. Without the reservation a
 * seller payment could settle the order while a buyer proof is pending, and
 * approving that proof later would push the order past its required amount.
 */
export function assertWithinSellerLimit(
  amountCents: number,
  pendingAmount: number,
  reservedCents: number,
) {
  const pendingCents = toCents(pendingAmount);
  if (amountCents > pendingCents - reservedCents) {
    throw new BadRequestException(
      reservedCents > 0 && amountCents <= pendingCents
        ? "Rechaza o valida el comprobante pendiente antes de registrar este pago"
        : "El abono excede el saldo pendiente",
    );
  }
}

@Injectable()
export class OrderPaymentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Finds another payment with the same operation code in this store.
   *
   * Comparison is ASCII-only and locale independent: the stored value and the
   * input both go through NFKC, every non-`[A-Za-z0-9]` is dropped and the
   * rest is uppercased. Every write path stores
   * `normalizeOperationCodeForStorage(code)`, so rows written by it compare
   * correctly; legacy rows written before that may hold un-normalized text
   * and can be missed (documented, acceptable).
   *
   * `storeId` must come from the authenticated store path after
   * `assertOwnership`, never from the body. The query joins `Order` and
   * filters its `storeId` as well. Voided payments, REJECTED proofs and
   * PENDING_REVIEW rows of `currentOrderId` itself are not duplicates. A code
   * that normalizes to '' is skipped.
   */
  async findDuplicateOperationCode(
    storeId: string,
    code: string,
    { currentOrderId }: { currentOrderId: string },
  ): Promise<{ orderId: string } | null> {
    const normalized = normalizeOperationCode(code);
    if (!normalized) return null;

    const matches = await this.prisma.$queryRaw<Array<{ orderId: string }>>`
      SELECT o."id" AS "orderId"
      FROM "OrderPayment" p
      JOIN "Order" o ON o."id" = p."orderId"
      WHERE o."storeId" = ${storeId}
        AND p."storeId" = ${storeId}
        AND p."operationCode" IS NOT NULL
        AND p."voidedAt" IS NULL
        AND p."reviewStatus" <> 'REJECTED'
        AND NOT (p."orderId" = ${currentOrderId} AND p."reviewStatus" = 'PENDING_REVIEW')
        AND upper(regexp_replace(p."operationCode", '[^A-Za-z0-9]', '', 'g')) = ${normalized}
      LIMIT 1
    `;
    return matches[0] ? { orderId: matches[0].orderId } : null;
  }
}
