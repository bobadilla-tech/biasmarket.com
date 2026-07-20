import { describe, expect, it } from 'vitest';
import {
  assertFulfillmentTransition,
  assertPaymentTransition,
  InvalidOrderTransitionError,
} from './order-status.vo.js';

describe('assertPaymentTransition', () => {
  it('allows PENDING_PAYMENT -> PAYMENT_SUBMITTED', () => {
    expect(() => assertPaymentTransition('PENDING_PAYMENT', 'PAYMENT_SUBMITTED')).not.toThrow();
  });

  it('allows PENDING_PAYMENT -> VERIFIED directly (no in-app proof step in MVP)', () => {
    expect(() => assertPaymentTransition('PENDING_PAYMENT', 'VERIFIED')).not.toThrow();
  });

  it('allows PENDING_PAYMENT -> REJECTED directly', () => {
    expect(() => assertPaymentTransition('PENDING_PAYMENT', 'REJECTED')).not.toThrow();
  });

  it('allows PENDING_PAYMENT -> CANCELLED (expiration)', () => {
    expect(() => assertPaymentTransition('PENDING_PAYMENT', 'CANCELLED')).not.toThrow();
  });

  it('allows PAYMENT_SUBMITTED -> VERIFIED', () => {
    expect(() => assertPaymentTransition('PAYMENT_SUBMITTED', 'VERIFIED')).not.toThrow();
  });

  it('allows PAYMENT_SUBMITTED -> REJECTED', () => {
    expect(() => assertPaymentTransition('PAYMENT_SUBMITTED', 'REJECTED')).not.toThrow();
  });

  it('rejects PAYMENT_SUBMITTED -> CANCELLED', () => {
    expect(() => assertPaymentTransition('PAYMENT_SUBMITTED', 'CANCELLED')).toThrow(
      InvalidOrderTransitionError,
    );
  });

  it('rejects re-approving an already VERIFIED order', () => {
    expect(() => assertPaymentTransition('VERIFIED', 'VERIFIED')).toThrow(
      InvalidOrderTransitionError,
    );
  });

  it('rejects approving an already REJECTED order', () => {
    expect(() => assertPaymentTransition('REJECTED', 'VERIFIED')).toThrow(
      InvalidOrderTransitionError,
    );
  });

  it('rejects any transition out of CANCELLED', () => {
    expect(() => assertPaymentTransition('CANCELLED', 'VERIFIED')).toThrow(
      InvalidOrderTransitionError,
    );
  });
});

describe('assertFulfillmentTransition', () => {
  it('allows ORDERING -> IN_TRANSIT -> READY -> COMPLETED in sequence', () => {
    expect(() => assertFulfillmentTransition('ORDERING', 'IN_TRANSIT')).not.toThrow();
    expect(() => assertFulfillmentTransition('IN_TRANSIT', 'READY')).not.toThrow();
    expect(() => assertFulfillmentTransition('READY', 'COMPLETED')).not.toThrow();
  });

  it('rejects skipping a state (ORDERING -> READY)', () => {
    expect(() => assertFulfillmentTransition('ORDERING', 'READY')).toThrow(
      InvalidOrderTransitionError,
    );
  });

  it('rejects any transition out of COMPLETED', () => {
    expect(() => assertFulfillmentTransition('COMPLETED', 'ORDERING')).toThrow(
      InvalidOrderTransitionError,
    );
  });
});
