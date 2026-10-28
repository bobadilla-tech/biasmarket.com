import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@biasmarket/db';
import { type Mock, vi } from 'vitest';
import { VoidOrderPaymentUseCase } from './void-order-payment.usecase.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { OrderRepository } from '../infrastructure/order.repository.js';
import { OrderEventsService } from './order-events.service.js';

describe('VoidOrderPaymentUseCase', () => {
  let useCase: VoidOrderPaymentUseCase;
  let orders: { assertOwnership: Mock };
  let events: { record: Mock };
  let tx: {
    $queryRaw: Mock;
    order: { findFirst: Mock; update: Mock };
    orderPayment: { findFirst: Mock; findMany: Mock; update: Mock };
    auditLog: { create: Mock };
  };

  const storeId = 'store-1';
  const orderId = 'order-1';
  const paymentId = 'payment-1';
  const userId = 'seller-1';

  beforeEach(() => {
    tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: orderId }]),
      order: {
        findFirst: vi.fn().mockResolvedValue({
          paymentStatus: 'PARTIALLY_PAID',
          fulfillmentStatus: 'ORDERING',
          requiredAmount: new Prisma.Decimal(100),
          currency: 'PEN',
        }),
        update: vi.fn(),
      },
      orderPayment: {
        findFirst: vi.fn().mockResolvedValue({
          id: paymentId,
          amount: new Prisma.Decimal(20),
          source: 'SELLER_RECORDED',
          reviewStatus: 'N_A',
          voidedAt: null,
        }),
        findMany: vi.fn().mockResolvedValue([
          {
            amount: new Prisma.Decimal(20),
            source: 'SELLER_RECORDED',
            reviewStatus: 'N_A',
            voidedAt: new Date(),
          },
          {
            amount: new Prisma.Decimal(30),
            source: 'SELLER_RECORDED',
            reviewStatus: 'N_A',
            voidedAt: null,
          },
        ]),
        update: vi.fn(),
      },
      auditLog: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn((callback: (transaction: unknown) => unknown) =>
        callback(tx),
      ),
    };
    orders = { assertOwnership: vi.fn() };
    events = { record: vi.fn() };
    useCase = new VoidOrderPaymentUseCase(
      prisma as never as PrismaService,
      orders as never as OrderRepository,
      events as never as OrderEventsService,
    );
  });

  it('allows voiding a payment before fulfillment advances and recalculates to PARTIALLY_PAID', async () => {
    const result = await useCase.execute(
      orderId,
      paymentId,
      storeId,
      userId,
      'Duplicate entry',
    );

    expect(orders.assertOwnership).toHaveBeenCalledWith(storeId, userId);
    expect(tx.orderPayment.update).toHaveBeenCalledWith({
      where: { id: paymentId },
      data: {
        voidedAt: expect.any(Date),
        voidedBy: userId,
        voidReason: 'Duplicate entry',
      },
    });
    expect(tx.order.update).toHaveBeenCalledWith({
      where: { id: orderId },
      data: { paymentStatus: 'PARTIALLY_PAID' },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: userId,
        storeId,
        action: 'payment.voided',
        entityType: 'OrderPayment',
        entityId: paymentId,
        metadata: { orderId, reason: 'Duplicate entry' },
      }),
    });
    expect(result.paymentStatus).toBe('PARTIALLY_PAID');
  });

  it('records PAYMENT_VOIDED inside the transaction without the seller reason', async () => {
    await useCase.execute(
      orderId,
      paymentId,
      storeId,
      userId,
      'Duplicate entry, buyer was rude',
    );

    expect(events.record).toHaveBeenCalledTimes(1);
    expect(events.record).toHaveBeenCalledWith(tx, {
      orderId,
      storeId,
      type: 'PAYMENT_VOIDED',
      actor: 'SELLER',
      payload: { amount: 20, currency: 'PEN', paymentId },
    });
    expect(JSON.stringify(events.record.mock.calls)).not.toContain('rude');
  });

  it('records nothing when the void is rejected', async () => {
    tx.order.findFirst.mockResolvedValueOnce({
      paymentStatus: 'VERIFIED',
      fulfillmentStatus: 'ORDERING',
      requiredAmount: new Prisma.Decimal(100),
      currency: 'PEN',
    });
    await expect(
      useCase.execute(orderId, paymentId, storeId, userId, 'Mistake'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(events.record).not.toHaveBeenCalled();
  });

  it('rejects voiding after an order has been verified', async () => {
    tx.order.findFirst.mockResolvedValueOnce({
      paymentStatus: 'VERIFIED',
      fulfillmentStatus: 'ORDERING',
      requiredAmount: new Prisma.Decimal(100),
    });

    await expect(
      useCase.execute(orderId, paymentId, storeId, userId, 'Mistake'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.orderPayment.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects voiding after fulfillment advances', async () => {
    tx.order.findFirst.mockResolvedValueOnce({
      paymentStatus: 'VERIFIED',
      fulfillmentStatus: 'IN_TRANSIT',
      requiredAmount: new Prisma.Decimal(100),
    });

    await expect(
      useCase.execute(orderId, paymentId, storeId, userId, 'Mistake'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.orderPayment.update).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('does not void a buyer proof before review', async () => {
    tx.orderPayment.findFirst.mockResolvedValueOnce({
      id: paymentId,
      amount: new Prisma.Decimal(20),
      source: 'BUYER_SUBMITTED',
      reviewStatus: 'PENDING_REVIEW',
      voidedAt: null,
    });

    await expect(
      useCase.execute(orderId, paymentId, storeId, userId, 'Mistake'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.orderPayment.update).not.toHaveBeenCalled();
  });
});
