import type { FulfillmentStatus, PaymentStatus } from '@biasmarket/db';
import { assertFulfillmentTransition, assertPaymentTransition } from './order-status.vo.js';
import { BadRequestException } from '@nestjs/common';

export class Order {
  constructor(
    public readonly id: string,
    public readonly storeId: string,
    private paymentStatus: PaymentStatus,
    private fulfillmentStatus: FulfillmentStatus,
  ) {}

  get currentPaymentStatus(): PaymentStatus {
    return this.paymentStatus;
  }

  get currentFulfillmentStatus(): FulfillmentStatus {
    return this.fulfillmentStatus;
  }

  approvePayment(): void {
    assertPaymentTransition(this.paymentStatus, 'VERIFIED');
    this.paymentStatus = 'VERIFIED';
  }

  rejectPayment(): void {
    assertPaymentTransition(this.paymentStatus, 'REJECTED');
    this.paymentStatus = 'REJECTED';
  }

  expire(): void {
    assertPaymentTransition(this.paymentStatus, 'CANCELLED');
    this.paymentStatus = 'CANCELLED';
  }

  advanceFulfillment(next: FulfillmentStatus): void {
    if (this.paymentStatus !== 'VERIFIED') {
      throw new BadRequestException(
        'Order must be VERIFIED before fulfillment can advance',
      );
    }
    assertFulfillmentTransition(this.fulfillmentStatus, next);
    this.fulfillmentStatus = next;
  }
}
