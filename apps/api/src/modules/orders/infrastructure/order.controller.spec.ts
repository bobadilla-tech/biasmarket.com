import { Test, type TestingModule } from '@nestjs/testing';
import { type Mock, vi } from 'vitest';

vi.mock('@thallesp/nestjs-better-auth', () => ({
  AuthGuard: class AuthGuard {},
  Session: () => () => undefined,
}));

vi.mock('@nestjs/throttler', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs/throttler')>();
  return { ...actual, ThrottlerGuard: class ThrottlerGuard {} };
});

import { NotFoundException } from '@nestjs/common';
import { OrderController } from './order.controller.js';
import { OrderRepository } from './order.repository.js';
import { ReviewPaymentUseCase } from '../application/review-payment.usecase.js';
import { AdvanceFulfillmentUseCase } from '../application/advance-fulfillment.usecase.js';
import { CancelOrderUseCase } from '../application/cancel-order.usecase.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { StorageService } from '../../../storage/storage.service.js';

describe('OrderController.addPayment', () => {
  let controller: OrderController;
  let orders: {
    assertOwnership: Mock;
    findRowByIdForStore: Mock;
    findPaymentForStore: Mock;
    saveStatus: Mock;
  };
  let reviewPayment: { execute: Mock };
  let storage: { uploadPaymentImage: Mock; getPaymentImageStream: Mock };
  let prisma: { $transaction: Mock; orderPayment: { create: Mock } };
  let tx: { orderPayment: { create: Mock }; auditLog: { create: Mock } };

  const storeId = 'store-1';
  const orderId = 'order-1';
  const userId = 'user-1';
  const session = { user: { id: userId } } as any;

  const fullOrderFixture = {
    id: orderId,
    storeId,
    customerId: null,
    customerEmail: null,
    customerPhone: '+51999999999',
    customerName: null,
    deliveryMethodType: 'COURIER',
    deliveryDetails: {},
    pickupPointId: null,
    paymentStatus: 'PARTIALLY_PAID',
    paymentRejectionReason: null,
    fulfillmentStatus: 'ORDERING',
    status: 'ACTIVE',
    cancellationResolution: null,
    cancellationReason: null,
    totalAmount: { toString: () => '100.00' },
    requiredAmount: { toString: () => '100.00' },
    currency: 'PEN',
    expiresAt: new Date('2026-08-10T00:00:00.000Z'),
    createdAt: new Date('2026-08-05T00:00:00.000Z'),
    paidAmount: 40,
    pendingAmount: 60,
    paidPercentage: 40,
    items: [],
    payments: [],
  };

  beforeEach(async () => {
    tx = {
      orderPayment: { create: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    prisma = {
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(tx)),
      orderPayment: tx.orderPayment,
    };
    orders = {
      assertOwnership: vi.fn(),
      findRowByIdForStore: vi.fn(),
      findPaymentForStore: vi.fn(),
      saveStatus: vi.fn(),
    };
    reviewPayment = { execute: vi.fn() };
    storage = { uploadPaymentImage: vi.fn(), getPaymentImageStream: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [
        { provide: OrderRepository, useValue: orders },
        { provide: ReviewPaymentUseCase, useValue: reviewPayment },
        { provide: AdvanceFulfillmentUseCase, useValue: { execute: vi.fn() } },
        { provide: CancelOrderUseCase, useValue: { execute: vi.fn() } },
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();

    controller = module.get(OrderController);
  });

  it('a partial payment writes PARTIALLY_PAID directly, audits it, and never calls ReviewPaymentUseCase', async () => {
    orders.findRowByIdForStore
      .mockResolvedValueOnce({
        currency: 'PEN',
        paidAmount: 0,
        pendingAmount: 100,
        requiredAmount: '100.00',
      })
      .mockResolvedValueOnce(fullOrderFixture);

    await controller.addPayment(storeId, orderId, session, '40', 'YAPE');

    expect(orders.saveStatus).toHaveBeenCalledWith(
      orderId,
      { paymentStatus: 'PARTIALLY_PAID' },
      expect.anything(),
    );
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: userId,
        storeId,
        action: 'payment.partial',
        entityType: 'Order',
        entityId: orderId,
        metadata: {
          amount: 40,
          method: 'YAPE',
          resultingPaymentStatus: 'PARTIALLY_PAID',
        },
      },
    });
    expect(reviewPayment.execute).not.toHaveBeenCalled();
  });

  it('a payment reaching the required amount routes through ReviewPaymentUseCase instead of writing VERIFIED directly', async () => {
    orders.findRowByIdForStore
      .mockResolvedValueOnce({
        currency: 'PEN',
        paidAmount: 60,
        pendingAmount: 40,
        requiredAmount: '100.00',
      })
      .mockResolvedValueOnce(fullOrderFixture);

    await controller.addPayment(storeId, orderId, session, '40', 'YAPE');

    expect(orders.saveStatus).not.toHaveBeenCalled();
    expect(reviewPayment.execute).toHaveBeenCalledWith(
      orderId,
      storeId,
      userId,
      'approve',
    );
  });

  it("accepts a payment for exactly the displayed pendingAmount even when it's a float-trap value like 59.99", async () => {
    orders.findRowByIdForStore
      .mockResolvedValueOnce({
        currency: 'PEN',
        paidAmount: 40,
        pendingAmount: 59.99,
        requiredAmount: '99.99',
      })
      .mockResolvedValueOnce(fullOrderFixture);

    await controller.addPayment(storeId, orderId, session, '59.99', 'YAPE');

    expect(reviewPayment.execute).toHaveBeenCalledWith(
      orderId,
      storeId,
      userId,
      'approve',
    );
  });

  it('accepts a payment on an already-VERIFIED order with a residual balance, keeping it VERIFIED', async () => {
    orders.findRowByIdForStore
      .mockResolvedValueOnce({
        currency: 'PEN',
        paymentStatus: 'VERIFIED',
        paidAmount: 0,
        pendingAmount: 47,
        requiredAmount: '47.00',
      })
      .mockResolvedValueOnce(fullOrderFixture);

    await controller.addPayment(storeId, orderId, session, '27', 'YAPE');

    expect(orders.saveStatus).not.toHaveBeenCalled();
    expect(reviewPayment.execute).not.toHaveBeenCalled();
    expect(tx.orderPayment.create).toHaveBeenCalledWith({
      data: {
        orderId,
        storeId,
        amount: 27,
        currency: 'PEN',
        method: 'YAPE',
        note: undefined,
      },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: userId,
        storeId,
        action: 'payment.recorded',
        entityType: 'Order',
        entityId: orderId,
        metadata: {
          amount: 27,
          method: 'YAPE',
          resultingPaymentStatus: 'VERIFIED',
        },
      },
    });
  });

  it('does not route an already-VERIFIED order through ReviewPaymentUseCase even when the payment settles the balance', async () => {
    orders.findRowByIdForStore
      .mockResolvedValueOnce({
        currency: 'PEN',
        paymentStatus: 'VERIFIED',
        paidAmount: 0,
        pendingAmount: 47,
        requiredAmount: '47.00',
      })
      .mockResolvedValueOnce(fullOrderFixture);

    await controller.addPayment(storeId, orderId, session, '47', 'YAPE');

    expect(orders.saveStatus).not.toHaveBeenCalled();
    expect(reviewPayment.execute).not.toHaveBeenCalled();
    expect(tx.orderPayment.create).toHaveBeenCalled();
  });

  it('still rejects a payment on a VERIFIED order with no balance owed', async () => {
    orders.findRowByIdForStore.mockResolvedValueOnce({
      currency: 'PEN',
      paymentStatus: 'VERIFIED',
      paidAmount: 47,
      pendingAmount: 0,
      requiredAmount: '47.00',
    });

    await expect(
      controller.addPayment(storeId, orderId, session, '10', 'YAPE'),
    ).rejects.toThrow('La orden ya está pagada');

    expect(tx.orderPayment.create).not.toHaveBeenCalled();
    expect(orders.saveStatus).not.toHaveBeenCalled();
    expect(reviewPayment.execute).not.toHaveBeenCalled();
  });
});

describe('OrderController.getPaymentImage', () => {
  let controller: OrderController;
  let orders: {
    assertOwnership: Mock;
    findPaymentForStore: Mock;
  };
  let storage: { getPaymentImageStream: Mock };

  const storeId = 'store-1';
  const orderId = 'order-1';
  const paymentId = 'payment-1';
  const userId = 'user-1';
  const session = { user: { id: userId } } as any;

  beforeEach(async () => {
    orders = {
      assertOwnership: vi.fn(),
      findPaymentForStore: vi.fn(),
    };
    storage = { getPaymentImageStream: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [
        { provide: OrderRepository, useValue: orders },
        { provide: ReviewPaymentUseCase, useValue: { execute: vi.fn() } },
        { provide: AdvanceFulfillmentUseCase, useValue: { execute: vi.fn() } },
        { provide: CancelOrderUseCase, useValue: { execute: vi.fn() } },
        { provide: PrismaService, useValue: {} },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();

    controller = module.get(OrderController);
  });

  it('checks ownership before touching the payment or storage', async () => {
    orders.assertOwnership.mockRejectedValueOnce(new Error('not owner'));

    await expect(
      controller.getPaymentImage(storeId, orderId, paymentId, session),
    ).rejects.toThrow('not owner');

    expect(orders.findPaymentForStore).not.toHaveBeenCalled();
    expect(storage.getPaymentImageStream).not.toHaveBeenCalled();
  });

  it('404s when the payment has no image instead of streaming anything', async () => {
    orders.findPaymentForStore.mockResolvedValueOnce({
      id: paymentId,
      orderId,
      storeId,
      imageUrl: null,
    });

    await expect(
      controller.getPaymentImage(storeId, orderId, paymentId, session),
    ).rejects.toThrow(NotFoundException);

    expect(storage.getPaymentImageStream).not.toHaveBeenCalled();
  });

  it('streams the stored image with its content type once ownership and the payment both check out', async () => {
    orders.findPaymentForStore.mockResolvedValueOnce({
      id: paymentId,
      orderId,
      storeId,
      imageUrl: 'https://cdn.biasmarket.com/payments/payments/abc.jpg',
    });
    const body = { pipe: vi.fn() } as any;
    storage.getPaymentImageStream.mockResolvedValueOnce({
      body,
      contentType: 'image/jpeg',
    });

    const result = await controller.getPaymentImage(
      storeId,
      orderId,
      paymentId,
      session,
    );

    expect(orders.assertOwnership).toHaveBeenCalledWith(storeId, userId);
    expect(orders.findPaymentForStore).toHaveBeenCalledWith(
      paymentId,
      orderId,
      storeId,
    );
    expect(storage.getPaymentImageStream).toHaveBeenCalledWith(
      'https://cdn.biasmarket.com/payments/payments/abc.jpg',
    );
    expect(result.getStream()).toBe(body);
    expect(result.getHeaders().type).toBe('image/jpeg');
  });
});
