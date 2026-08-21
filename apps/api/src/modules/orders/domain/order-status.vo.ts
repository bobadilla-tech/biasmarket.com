import type { FulfillmentStatus, PaymentStatus } from '@biasmarket/db';

export class InvalidOrderTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Cannot transition order from ${from} to ${to}`);
    this.name = 'InvalidOrderTransitionError';
  }
}

// Checkout collects an in-app payment proof for a configured manual method,
// but only when one is required — CASH, no method selected, or a method the
// store enabled but never finished configuring all skip straight to the
// post-order WhatsApp handoff instead. So there's still no *guaranteed*
// PAYMENT_SUBMITTED step: sellers may approve/reject directly from
// PENDING_PAYMENT based on the WhatsApp conversation whenever no proof was
// collected.
const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  PENDING_PAYMENT: [
    'PARTIALLY_PAID',
    'PAYMENT_SUBMITTED',
    'VERIFIED',
    'REJECTED',
    'CANCELLED',
  ],
  PARTIALLY_PAID: [
    'PARTIALLY_PAID',
    'PAYMENT_SUBMITTED',
    'VERIFIED',
    'REJECTED',
    'CANCELLED',
  ],
  PAYMENT_SUBMITTED: ['PARTIALLY_PAID', 'VERIFIED', 'REJECTED'],
  VERIFIED: [],
  REJECTED: [],
  CANCELLED: [],
};

export function assertPaymentTransition(
  from: PaymentStatus,
  to: PaymentStatus,
): void {
  if (!PAYMENT_TRANSITIONS[from]?.includes(to)) {
    throw new InvalidOrderTransitionError(from, to);
  }
}

const FULFILLMENT_TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> =
  {
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
