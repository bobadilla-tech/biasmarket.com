import { Test, type TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException } from '@nestjs/common';
import { type Mock, vi } from 'vitest';
import { createOrderAccessToken } from '@biasmarket/utils/assisted-order';
import {
  OrderEventsService,
  sanitizeOrderEventPayload,
} from './order-events.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';

describe('sanitizeOrderEventPayload', () => {
  it('keeps the allowlist and drops phone, token, email, and notes', () => {
    expect(
      sanitizeOrderEventPayload({
        amount: 40,
        method: 'YAPE',
        phone: '+51987654321',
        customerPhone: '+51987654321',
        token: 'secret-token',
        accessToken: 'secret-token',
        email: 'buyer@example.com',
        customerEmail: 'buyer@example.com',
        note: 'internal note',
        notes: 'internal note',
        reason: 'seller-only reason',
      }),
    ).toEqual({ amount: 40, method: 'YAPE' });
  });
});

describe('OrderEventsService', () => {
  let service: OrderEventsService;
  let prisma: {
    orderEvent: { create: Mock; findMany: Mock; findFirst: Mock };
    order: { findUnique: Mock; updateMany: Mock };
    $transaction: Mock;
    $executeRaw: Mock;
  };

  let notifications: { createIfNotOpen: Mock };

  beforeEach(async () => {
    notifications = { createIfNotOpen: vi.fn().mockResolvedValue({}) };
    prisma = {
      orderEvent: {
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
      },
      order: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'order-1',
          storeId: 'store-1',
          accessTokenRevokedAt: null,
          status: 'ACTIVE',
          paymentStatus: 'PENDING_PAYMENT',
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      $executeRaw: vi.fn(),
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderEventsService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
      ],
    }).compile();
    service = module.get(OrderEventsService);
  });

  it('marks invite events internal and payment events visible to the buyer', async () => {
    await service.record(prisma, {
      orderId: 'order-1',
      storeId: 'store-1',
      type: 'INVITE_SHOWN',
      actor: 'BUYER',
      payload: { phone: '+51987654321' },
    });
    await service.record(prisma, {
      orderId: 'order-1',
      storeId: 'store-1',
      type: 'PAYMENT_VALIDATED',
      actor: 'SELLER',
      payload: { amount: 10 },
    });

    expect(prisma.orderEvent.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        type: 'INVITE_SHOWN',
        visibleToBuyer: false,
        payload: {},
      }),
    });
    expect(prisma.orderEvent.create).toHaveBeenNthCalledWith(2, {
      data: expect.objectContaining({
        type: 'PAYMENT_VALIDATED',
        visibleToBuyer: true,
        payload: { amount: 10 },
        storeId: 'store-1',
      }),
    });
  });

  it('writes the order store id when the caller passes a different one', async () => {
    prisma.order.findUnique.mockResolvedValue({ storeId: 'store-from-order' });

    await service.record(prisma, {
      orderId: 'order-1',
      storeId: 'store-from-caller',
      type: 'PAYMENT_VALIDATED',
      actor: 'SELLER',
    });

    expect(prisma.orderEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ storeId: 'store-from-order' }),
    });
  });

  it('records INVITE_SHOWN once and skips a cancelled order', async () => {
    const { token } = createOrderAccessToken();
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      storeId: 'store-1',
      accessTokenRevokedAt: null,
      status: 'ACTIVE',
      paymentStatus: 'PENDING_PAYMENT',
    });

    await service.recordInvite(token, 'INVITE_SHOWN');
    expect(prisma.orderEvent.create).toHaveBeenCalledTimes(1);
    expect(prisma.orderEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ type: 'INVITE_SHOWN', actor: 'BUYER' }),
    });
    // The dedupe check runs under the per-order advisory lock.
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);

    prisma.orderEvent.findFirst.mockResolvedValue({ id: 'event-1' });
    await service.recordInvite(token, 'INVITE_SHOWN');
    expect(prisma.orderEvent.create).toHaveBeenCalledTimes(1);

    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      storeId: 'store-1',
      accessTokenRevokedAt: null,
      status: 'CANCELLED',
      paymentStatus: 'CANCELLED',
    });
    await service.recordInvite(token, 'INVITE_CLICKED');
    expect(prisma.orderEvent.create).toHaveBeenCalledTimes(1);
  });

  it('lists only events marked visible to the buyer', async () => {
    prisma.orderEvent.findMany.mockResolvedValue([]);

    await service.listForBuyer('order-1');

    expect(prisma.orderEvent.findMany).toHaveBeenCalledWith({
      where: { orderId: 'order-1', visibleToBuyer: true },
      orderBy: { createdAt: 'asc' },
      select: { type: true, createdAt: true, payload: true },
    });
  });

  it('returns the same not-found error for a missing or revoked token', async () => {
    const { token, tokenHash } = createOrderAccessToken();
    prisma.order.findUnique.mockResolvedValueOnce(null);
    await expect(service.requireOrderForToken(token)).rejects.toThrow(
      NotFoundException,
    );

    prisma.order.findUnique.mockResolvedValueOnce({
      id: 'order-1',
      storeId: 'store-1',
      accessTokenRevokedAt: new Date(),
    });
    await expect(service.requireOrderForToken('other-token')).rejects.toThrow(
      'Pedido no encontrado',
    );

    expect(prisma.order.findUnique).toHaveBeenCalledWith({
      where: { accessTokenHash: tokenHash },
      select: {
        id: true,
        storeId: true,
        accessTokenRevokedAt: true,
        status: true,
        paymentStatus: true,
        fulfillmentStatus: true,
        packedPhotoUrl: true,
      },
    });
  });

  describe('confirmReceipt', () => {
    const { token } = createOrderAccessToken();
    const base = {
      id: 'order-1',
      storeId: 'store-1',
      accessTokenRevokedAt: null,
      status: 'ACTIVE',
      paymentStatus: 'VERIFIED',
      fulfillmentStatus: 'IN_TRANSIT',
    };

    it('stamps the order, records one buyer event and notifies the seller', async () => {
      prisma.order.findUnique.mockResolvedValue(base);

      const result = await service.confirmReceipt(token);

      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'order-1',
          storeId: 'store-1',
          buyerConfirmedReceivedAt: null,
          paymentStatus: 'VERIFIED',
          status: { not: 'CANCELLED' },
          fulfillmentStatus: { in: ['IN_TRANSIT', 'READY', 'COMPLETED'] },
        },
        data: { buyerConfirmedReceivedAt: expect.any(Date) },
      });
      expect(prisma.orderEvent.create).toHaveBeenCalledTimes(1);
      expect(prisma.orderEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          type: 'RECEIPT_CONFIRMED',
          actor: 'BUYER',
          visibleToBuyer: true,
          payload: {},
        }),
      });
      const params = notifications.createIfNotOpen.mock.calls[0][0];
      expect(params).toMatchObject({
        storeId: 'store-1',
        type: 'RECEIPT_CONFIRMED',
        entityType: 'Order',
        entityId: 'order-1',
      });
      expect(JSON.stringify(params)).not.toMatch(/\+?\d{6,}/);
      expect(Date.parse(result.receiptConfirmedAt)).not.toBeNaN();
    });

    it.each(['IN_TRANSIT', 'READY', 'COMPLETED'])(
      'is allowed while fulfillment is %s',
      async (fulfillmentStatus) => {
        prisma.order.findUnique.mockResolvedValue({
          ...base,
          fulfillmentStatus,
        });
        await expect(service.confirmReceipt(token)).resolves.toBeDefined();
      },
    );

    it.each([
      ['still ORDERING', { fulfillmentStatus: 'ORDERING' }],
      ['payment not verified', { paymentStatus: 'PAYMENT_SUBMITTED' }],
      ['payment rejected', { paymentStatus: 'REJECTED' }],
      ['payment cancelled', { paymentStatus: 'CANCELLED' }],
      ['order cancelled', { status: 'CANCELLED' }],
    ])('answers 409 and writes nothing when %s', async (_label, patch) => {
      prisma.order.findUnique.mockResolvedValue({ ...base, ...patch });

      await expect(service.confirmReceipt(token)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
      expect(prisma.orderEvent.create).not.toHaveBeenCalled();
      expect(notifications.createIfNotOpen).not.toHaveBeenCalled();
    });

    it('answers the same 404 for an unknown and a revoked token, before any 409', async () => {
      prisma.order.findUnique.mockResolvedValueOnce(null);
      await expect(service.confirmReceipt(token)).rejects.toThrow(
        'Pedido no encontrado',
      );
      prisma.order.findUnique.mockResolvedValueOnce({
        ...base,
        status: 'CANCELLED',
        accessTokenRevokedAt: new Date(),
      });
      await expect(service.confirmReceipt(token)).rejects.toThrow(
        'Pedido no encontrado',
      );
    });

    it('is idempotent: a second confirmation returns the stored date with no event or notification', async () => {
      const stored = new Date('2026-10-01T12:00:00.000Z');
      prisma.order.findUnique
        .mockResolvedValueOnce(base)
        .mockResolvedValueOnce({ buyerConfirmedReceivedAt: stored });
      prisma.order.updateMany.mockResolvedValue({ count: 0 });

      const result = await service.confirmReceipt(token);

      expect(result.receiptConfirmedAt).toBe(stored.toISOString());
      expect(prisma.orderEvent.create).not.toHaveBeenCalled();
      expect(notifications.createIfNotOpen).not.toHaveBeenCalled();
    });

    it('answers 409 when the order stops being eligible between the read and the write', async () => {
      prisma.order.findUnique
        .mockResolvedValueOnce(base)
        .mockResolvedValueOnce({ buyerConfirmedReceivedAt: null });
      prisma.order.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.confirmReceipt(token)).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.orderEvent.create).not.toHaveBeenCalled();
      expect(notifications.createIfNotOpen).not.toHaveBeenCalled();
    });

    it('does not fail the receipt when the seller notification fails', async () => {
      prisma.order.findUnique.mockResolvedValue(base);
      notifications.createIfNotOpen.mockRejectedValue(new Error('boom'));

      await expect(service.confirmReceipt(token)).resolves.toBeDefined();
      expect(prisma.orderEvent.create).toHaveBeenCalledTimes(1);
    });
  });
});
