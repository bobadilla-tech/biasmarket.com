import type { PaymentStatus } from '@biasmarket/db';

// Payment statuses that keep stock soft-held (reserved). Orders in one of
// these past `expiresAt` are cancelled by the expiry sweep; every other status
// (VERIFIED included) keeps its past `expiresAt` untouched.
export const RESERVED_HOLD_STATUSES: readonly PaymentStatus[] = [
  'PENDING_PAYMENT',
  'PARTIALLY_PAID',
  'PAYMENT_SUBMITTED',
];
