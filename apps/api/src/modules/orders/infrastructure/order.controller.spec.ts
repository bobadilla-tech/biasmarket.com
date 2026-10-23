import { Test, type TestingModule } from '@nestjs/testing';
import { type Mock, vi } from 'vitest';
import { Prisma } from '@biasmarket/db';

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
import { OrderEventsService } from '../application/order-events.service.js';

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
  let events: { record: Mock };
  let prisma: {
    $transaction: Mock;
    orderPayment: { create: Mock };
  };
  let tx: {
    order: { findUniqueOrThrow: Mock };
    orderPayment: { create: Mock; aggregate: Mock };
    auditLog: { create: Mock };
  };

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
      order: { findUniqueOrThrow: vi.fn() },
      orderPayment: { create: vi.fn(), aggregate: vi.fn() },
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
    events = { record: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [
        { provide: OrderRepository, useValue: orders },
        { provide: ReviewPaymentUseCase, useValue: reviewPayment },
        { provide: AdvanceFulfillmentUseCase, useValue: { execute: vi.fn() } },
        { provide: CancelOrderUseCase, useValue: { execute: vi.fn() } },
        { provide: PrismaService, useValue: prisma },
        { provide: StorageService, useValue: storage },
        { provide: OrderEventsService, useValue: events },
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

    tx.order.findUniqueOrThrow.mockResolvedValueOnce({
      paymentStatus: 'PARTIALLY_PAID',
      requiredAmount: '100.00',
      currency: 'PEN',
    });
    tx.orderPayment.aggregate.mockResolvedValueOnce({
      _sum: { amount: 0 },
    });

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
    expect(events.record).toHaveBeenCalledTimes(1);
    expect(events.record).toHaveBeenCalledWith(tx, {
      orderId,
      storeId,
      type: 'PAYMENT_SUBMITTED',
      actor: 'SELLER',
      payload: { amount: 40, method: 'YAPE' },
    });
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

    tx.order.findUniqueOrThrow.mockResolvedValueOnce({
      paymentStatus: 'PARTIALLY_PAID',
      requiredAmount: '100.00',
      currency: 'PEN',
    });
    tx.orderPayment.aggregate.mockResolvedValueOnce({
      _sum: { amount: 60 },
    });

    await controller.addPayment(storeId, orderId, session, '40', 'YAPE');

    expect(orders.saveStatus).not.toHaveBeenCalled();
    expect(reviewPayment.execute).toHaveBeenCalledWith(
      orderId,
      storeId,
      userId,
      'approve',
    );
    expect(events.record).toHaveBeenCalledTimes(1);
    expect(events.record).toHaveBeenCalledWith(tx, {
      orderId,
      storeId,
      type: 'PAYMENT_SUBMITTED',
      actor: 'SELLER',
      payload: { amount: 40, method: 'YAPE' },
    });
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

    tx.order.findUniqueOrThrow.mockResolvedValueOnce({
      paymentStatus: 'PARTIALLY_PAID',
      requiredAmount: '99.99',
      currency: 'PEN',
    });
    tx.orderPayment.aggregate.mockResolvedValueOnce({
      _sum: { amount: 40 },
    });

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

    tx.order.findUniqueOrThrow.mockResolvedValueOnce({
      paymentStatus: 'VERIFIED',
      requiredAmount: '47.00',
      currency: 'PEN',
    });
    tx.orderPayment.aggregate.mockResolvedValueOnce({
      _sum: { amount: 0 },
    });

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
    expect(events.record).toHaveBeenCalledTimes(1);
    expect(events.record).toHaveBeenCalledWith(tx, {
      orderId,
      storeId,
      type: 'PAYMENT_SUBMITTED',
      actor: 'SELLER',
      payload: { amount: 27, method: 'YAPE' },
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

    tx.order.findUniqueOrThrow.mockResolvedValueOnce({
      paymentStatus: 'VERIFIED',
      requiredAmount: '47.00',
      currency: 'PEN',
    });
    tx.orderPayment.aggregate.mockResolvedValueOnce({
      _sum: { amount: 0 },
    });

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
        { provide: OrderEventsService, useValue: { record: vi.fn() } },
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

describe('OrderController.reviewPaymentProof', () => {
  let controller: OrderController;
  let orders: {
    assertOwnership: Mock;
    findPaymentForStore: Mock;
    findRowByIdForStore: Mock;
    saveStatus: Mock;
  };
  let reviewPayment: { execute: Mock };
  let events: { record: Mock };
  let prisma: { $transaction: Mock };
  let tx: {
    order: { findUniqueOrThrow: Mock };
    orderPayment: { update: Mock; findMany: Mock };
    auditLog: { create: Mock };
  };

  const storeId = 'store-1';
  const orderId = 'order-1';
  const paymentId = 'payment-1';
  const userId = 'user-1';
  const session = { user: { id: userId } } as any;

  const detailFixture = {
    id: orderId,
    storeId,
    deliveryDetails: null,
    pickupDate: null,
    retainedAmount: null,
    releasedAmount: null,
    releasedResolution: null,
    totalAmount: { toString: () => '100.00' },
    requiredAmount: { toString: () => '100.00' },
    expiresAt: new Date('2026-08-10T00:00:00.000Z'),
    createdAt: new Date('2026-08-05T00:00:00.000Z'),
    items: [],
    payments: [],
  };

  beforeEach(async () => {
    tx = {
      order: { findUniqueOrThrow: vi.fn() },
      orderPayment: { update: vi.fn(), findMany: vi.fn() },
      auditLog: { create: vi.fn() },
    };
    prisma = {
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    };
    orders = {
      assertOwnership: vi.fn(),
      findPaymentForStore: vi.fn().mockResolvedValue({
        id: paymentId,
        orderId,
        storeId,
        source: 'BUYER_SUBMITTED',
        reviewStatus: 'PENDING_REVIEW',
      }),
      findRowByIdForStore: vi.fn().mockResolvedValue(detailFixture),
      saveStatus: vi.fn(),
    };
    reviewPayment = { execute: vi.fn() };
    events = { record: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OrderController],
      providers: [
        { provide: OrderRepository, useValue: orders },
        { provide: ReviewPaymentUseCase, useValue: reviewPayment },
        { provide: AdvanceFulfillmentUseCase, useValue: { execute: vi.fn() } },
        { provide: CancelOrderUseCase, useValue: { execute: vi.fn() } },
        { provide: PrismaService, useValue: prisma },
        {
          provide: StorageService,
          useValue: {
            uploadPaymentImage: vi.fn(),
            getPaymentImageStream: vi.fn(),
          },
        },
        { provide: OrderEventsService, useValue: events },
      ],
    }).compile();

    controller = module.get(OrderController);
  });

  it('writes PARTIALLY_PAID inside the review transaction and records one PAYMENT_VALIDATED with the paymentId', async () => {
    tx.order.findUniqueOrThrow.mockResolvedValue({
      paymentStatus: 'PENDING_PAYMENT',
      requiredAmount: new Prisma.Decimal('100.00'),
    });
    tx.orderPayment.findMany.mockResolvedValue([
      {
        amount: new Prisma.Decimal('40.00'),
        source: 'BUYER_SUBMITTED',
        reviewStatus: 'APPROVED',
      },
    ]);

    await controller.reviewPaymentProof(storeId, orderId, paymentId, session, {
      decision: 'approve',
    });

    expect(events.record).toHaveBeenCalledTimes(1);
    expect(events.record).toHaveBeenCalledWith(tx, {
      orderId,
      storeId,
      type: 'PAYMENT_VALIDATED',
      actor: 'SELLER',
      payload: { paymentId },
    });
    expect(orders.saveStatus).toHaveBeenCalledWith(
      orderId,
      { paymentStatus: 'PARTIALLY_PAID' },
      tx,
    );
    expect(reviewPayment.execute).not.toHaveBeenCalled();
  });

  it('lets ReviewPaymentUseCase settle a proof that clears the balance without a second PAYMENT_VALIDATED', async () => {
    tx.order.findUniqueOrThrow.mockResolvedValue({
      paymentStatus: 'PARTIALLY_PAID',
      requiredAmount: new Prisma.Decimal('100.00'),
    });
    tx.orderPayment.findMany.mockResolvedValue([
      {
        amount: new Prisma.Decimal('60.00'),
        source: 'SELLER_RECORDED',
        reviewStatus: 'N_A',
      },
      {
        amount: new Prisma.Decimal('40.00'),
        source: 'BUYER_SUBMITTED',
        reviewStatus: 'APPROVED',
      },
    ]);

    await controller.reviewPaymentProof(storeId, orderId, paymentId, session, {
      decision: 'approve',
    });

    expect(events.record).toHaveBeenCalledTimes(1);
    expect(events.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({
        type: 'PAYMENT_VALIDATED',
        payload: { paymentId },
      }),
    );
    expect(orders.saveStatus).not.toHaveBeenCalled();
    expect(reviewPayment.execute).toHaveBeenCalledWith(
      orderId,
      storeId,
      userId,
      'approve',
      undefined,
      { recordEvent: false },
    );
  });

  it('records PAYMENT_REJECTED and leaves the order status alone when the proof is rejected', async () => {
    await controller.reviewPaymentProof(storeId, orderId, paymentId, session, {
      decision: 'reject',
      reason: 'Comprobante ilegible',
    });

    expect(events.record).toHaveBeenCalledTimes(1);
    expect(events.record).toHaveBeenCalledWith(tx, {
      orderId,
      storeId,
      type: 'PAYMENT_REJECTED',
      actor: 'SELLER',
      payload: { paymentId },
    });
    expect(tx.order.findUniqueOrThrow).not.toHaveBeenCalled();
    expect(orders.saveStatus).not.toHaveBeenCalled();
    expect(reviewPayment.execute).not.toHaveBeenCalled();
  });

  it('refuses a proof that was not submitted by the buyer', async () => {
    orders.findPaymentForStore.mockResolvedValueOnce({
      id: paymentId,
      orderId,
      storeId,
      source: 'SELLER_RECORDED',
      reviewStatus: 'PENDING_REVIEW',
    });

    await expect(
      controller.reviewPaymentProof(storeId, orderId, paymentId, session, {
        decision: 'approve',
      }),
    ).rejects.toThrow(
      'Solo se pueden revisar comprobantes enviados por el comprador',
    );

    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
