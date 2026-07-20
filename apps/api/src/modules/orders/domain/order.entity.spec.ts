import { describe, expect, it } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { Order } from './order.entity.js';
import { InvalidOrderTransitionError } from './order-status.vo.js';

describe('Order entity', () => {
  it('approvePayment() moves PENDING_PAYMENT to VERIFIED', () => {
    const order = new Order('order-1', 'store-1', 'PENDING_PAYMENT', 'ORDERING');
    order.approvePayment();
    expect(order.currentPaymentStatus).toBe('VERIFIED');
  });

  it('rejectPayment() moves PAYMENT_SUBMITTED to REJECTED', () => {
    const order = new Order('order-1', 'store-1', 'PAYMENT_SUBMITTED', 'ORDERING');
    order.rejectPayment();
    expect(order.currentPaymentStatus).toBe('REJECTED');
  });

  it('approvePayment() throws when the order is already REJECTED', () => {
    const order = new Order('order-1', 'store-1', 'REJECTED', 'ORDERING');
    expect(() => order.approvePayment()).toThrow(InvalidOrderTransitionError);
  });

  it('expire() moves PENDING_PAYMENT to CANCELLED', () => {
    const order = new Order('order-1', 'store-1', 'PENDING_PAYMENT', 'ORDERING');
    order.expire();
    expect(order.currentPaymentStatus).toBe('CANCELLED');
  });

  it('advanceFulfillment() throws when payment is not yet VERIFIED', () => {
    const order = new Order('order-1', 'store-1', 'PENDING_PAYMENT', 'ORDERING');
    expect(() => order.advanceFulfillment('IN_TRANSIT')).toThrow(BadRequestException);
  });

  it('advanceFulfillment() advances when payment is VERIFIED', () => {
    const order = new Order('order-1', 'store-1', 'VERIFIED', 'ORDERING');
    order.advanceFulfillment('IN_TRANSIT');
    expect(order.currentFulfillmentStatus).toBe('IN_TRANSIT');
  });

  it('advanceFulfillment() throws on an out-of-order jump', () => {
    const order = new Order('order-1', 'store-1', 'VERIFIED', 'ORDERING');
    expect(() => order.advanceFulfillment('COMPLETED')).toThrow(InvalidOrderTransitionError);
  });
});
