import type { FulfillmentStatus, PaymentStatus } from '@biasmarket/db';

export class InvalidOrderTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Cannot transition order from ${from} to ${to}`);
    this.name = 'InvalidOrderTransitionError';
  }
}

// MVP checkout redirects the buyer to WhatsApp instead of collecting an
// in-app payment proof, so there is no guaranteed PAYMENT_SUBMITTED step —
// sellers may approve/reject directly from PENDING_PAYMENT based on the
// WhatsApp conversation.
const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  PENDING_PAYMENT: ['PAYMENT_SUBMITTED', 'VERIFIED', 'REJECTED', 'CANCELLED'],
  PAYMENT_SUBMITTED: ['VERIFIED', 'REJECTED'],
  VERIFIED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function assertPaymentTransition(from: PaymentStatus, to: PaymentStatus): void {
  if (!PAYMENT_TRANSITIONS[from]?.includes(to)) {
    throw new InvalidOrderTransitionError(from, to);
  }
}

const FULFILLMENT_TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  ORDERING: ['IN_TRANSIT'],
  IN_TRANSIT: ['READY'],
  READY: ['COMPLETED'],
  COMPLETED: [],
};

export function assertFulfillmentTransition(
  from: FulfillmentStatus,
  to: FulfillmentStatus,
): void {
  if (!FULFILLMENT_TRANSITIONS[from]?.includes(to)) {
    throw new InvalidOrderTransitionError(from, to);
  }
}
