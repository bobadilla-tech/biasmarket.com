import { Test, type TestingModule } from '@nestjs/testing';
import {
  ConflictException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { type Mock, vi } from 'vitest';
import { Prisma } from '@biasmarket/db';
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

  it('keeps the buyer-notice enum and nothing else of a notice event', () => {
    expect(
      sanitizeOrderEventPayload({
        notice: 'ASSISTED_IN_TRANSIT',
        link: 'https://example.com/pedido/secret',
        phone: '+51987654321',
      }),
    ).toEqual({ notice: 'ASSISTED_IN_TRANSIT' });
  });
});

const COUNTING_PAYMENT = {
  amount: 10,
  source: 'SELLER_RECORDED',
  reviewStatus: null,
  voidedAt: null,
};

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
          payments: [COUNTING_PAYMENT],
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
      payments: [COUNTING_PAYMENT],
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
      payments: [COUNTING_PAYMENT],
    });
    await service.recordInvite(token, 'INVITE_CLICKED');
    expect(prisma.orderEvent.create).toHaveBeenCalledTimes(1);
  });

  it('stores only the moment for an invite event, and dedupes SHOWN per moment', async () => {
    const { token } = createOrderAccessToken();
    prisma.order.findUnique.mockResolvedValue({
      id: 'order-1',
      storeId: 'store-1',
      accessTokenRevokedAt: null,
      status: 'ACTIVE',
      paymentStatus: 'VERIFIED',
      payments: [COUNTING_PAYMENT],
      claimedAt: null,
      buyerAccountId: null,
    });

    await service.recordInvite(token, 'INVITE_SHOWN', 'pago_validado');

    expect(prisma.orderEvent.findFirst).toHaveBeenCalledWith({
      where: {
        orderId: 'order-1',
        type: 'INVITE_SHOWN',
        payload: { path: ['moment'], equals: 'pago_validado' },
      },
      select: { id: true },
    });
    // The stored payload, not the input: only the allow-listed moment.
    expect(prisma.orderEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        type: 'INVITE_SHOWN',
        visibleToBuyer: false,
        payload: { moment: 'pago_validado' },
      }),
    });
    const lock = JSON.stringify(prisma.$executeRaw.mock.calls[0]);
    expect(lock).toContain('invite-shown:order-1:');

    // The same moment again is skipped; a different moment is a new row.
    prisma.orderEvent.findFirst.mockResolvedValueOnce({ id: 'e1' });
    await service.recordInvite(token, 'INVITE_SHOWN', 'pago_validado');
    expect(prisma.orderEvent.create).toHaveBeenCalledTimes(1);
    await service.recordInvite(token, 'INVITE_SHOWN', 'banner');
    expect(prisma.orderEvent.create).toHaveBeenCalledTimes(2);
    expect(prisma.orderEvent.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ payload: { moment: 'banner' } }),
    });
  });

  it('records clicks and dismissals with the moment, and nothing for a claimed order', async () => {
    const { token } = createOrderAccessToken();
    const base = {
      id: 'order-1',
      storeId: 'store-1',
      accessTokenRevokedAt: null,
      status: 'ACTIVE',
      paymentStatus: 'VERIFIED',
      payments: [COUNTING_PAYMENT],
      claimedAt: null,
      buyerAccountId: null,
    };
    prisma.order.findUnique.mockResolvedValue(base);
    await service.recordInvite(token, 'INVITE_CLICKED', 'entrega');
    await service.recordInvite(token, 'INVITE_DISMISSED', 'banner');
    expect(prisma.orderEvent.create).toHaveBeenCalledTimes(2);
    expect(prisma.orderEvent.create).toHaveBeenNthCalledWith(1, {
      data: expect.objectContaining({
        type: 'INVITE_CLICKED',
        payload: { moment: 'entrega' },
      }),
    });

    prisma.orderEvent.create.mockClear();
    for (const claimed of [
      { claimedAt: new Date() },
      { buyerAccountId: 'buyer-1' },
    ]) {
      prisma.order.findUnique.mockResolvedValue({ ...base, ...claimed });
      await service.recordInvite(token, 'INVITE_SHOWN', 'banner');
      await service.recordInvite(token, 'INVITE_CLICKED', 'banner');
    }
    expect(prisma.orderEvent.create).not.toHaveBeenCalled();
  });

  describe('invite preconditions', () => {
    const base = {
      id: 'order-1',
      storeId: 'store-1',
      accessTokenRevokedAt: null,
      status: 'ACTIVE',
      paymentStatus: 'VERIFIED',
      claimedAt: null,
      buyerAccountId: null,
      payments: [COUNTING_PAYMENT],
    };

    it.each([
      ['no payments at all', { payments: [] }],
      [
        'only an unreviewed buyer proof',
        {
          payments: [
            {
              amount: 10,
              source: 'BUYER_SUBMITTED',
              reviewStatus: 'PENDING_REVIEW',
              voidedAt: null,
            },
          ],
        },
      ],
      [
        'only a voided payment',
        { payments: [{ ...COUNTING_PAYMENT, voidedAt: new Date() }] },
      ],
      ['a rejected payment status', { paymentStatus: 'REJECTED' }],
    ])('writes no row for an order with %s', async (_label, patch) => {
      const { token } = createOrderAccessToken();
      prisma.order.findUnique.mockResolvedValue({ ...base, ...patch });

      for (const type of [
        'INVITE_SHOWN',
        'INVITE_CLICKED',
        'INVITE_DISMISSED',
      ] as const) {
        await expect(
          service.recordInvite(token, type, 'banner'),
        ).resolves.toBeUndefined();
      }

      expect(prisma.orderEvent.create).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('a rejected order that gets a counting payment becomes eligible again', async () => {
      const { token } = createOrderAccessToken();
      prisma.order.findUnique.mockResolvedValue({
        ...base,
        paymentStatus: 'REJECTED',
      });
      await service.recordInvite(token, 'INVITE_SHOWN', 'banner');
      expect(prisma.orderEvent.create).not.toHaveBeenCalled();

      prisma.order.findUnique.mockResolvedValue({
        ...base,
        paymentStatus: 'PARTIALLY_PAID',
      });
      await service.recordInvite(token, 'INVITE_SHOWN', 'banner');
      expect(prisma.orderEvent.create).toHaveBeenCalledTimes(1);
    });

    it('dedupes INVITE_CLICKED per moment under its own advisory lock', async () => {
      const { token } = createOrderAccessToken();
      prisma.order.findUnique.mockResolvedValue(base);

      await service.recordInvite(token, 'INVITE_CLICKED', 'banner');
      expect(prisma.orderEvent.findFirst).toHaveBeenCalledWith({
        where: {
          orderId: 'order-1',
          type: 'INVITE_CLICKED',
          payload: { path: ['moment'], equals: 'banner' },
        },
        select: { id: true },
      });
      expect(JSON.stringify(prisma.$executeRaw.mock.calls[0])).toContain(
        'invite-clicked:order-1:banner',
      );
      expect(prisma.orderEvent.create).toHaveBeenCalledTimes(1);

      // A second press of the same moment (retry after an error) is skipped.
      prisma.orderEvent.findFirst.mockResolvedValueOnce({ id: 'c1' });
      await service.recordInvite(token, 'INVITE_CLICKED', 'banner');
      expect(prisma.orderEvent.create).toHaveBeenCalledTimes(1);

      // A different moment is a new row.
      await service.recordInvite(token, 'INVITE_CLICKED', 'entrega');
      expect(prisma.orderEvent.create).toHaveBeenCalledTimes(2);
    });

    it('does not dedupe INVITE_DISMISSED', async () => {
      const { token } = createOrderAccessToken();
      prisma.order.findUnique.mockResolvedValue(base);
      prisma.orderEvent.findFirst.mockResolvedValue({ id: 'existing' });

      await service.recordInvite(token, 'INVITE_DISMISSED', 'banner');
      await service.recordInvite(token, 'INVITE_DISMISSED', 'banner');

      expect(prisma.$executeRaw).not.toHaveBeenCalled();
      expect(prisma.orderEvent.create).toHaveBeenCalledTimes(2);
    });

    it('answers the same 404 for a missing or revoked token', async () => {
      const { token } = createOrderAccessToken();
      prisma.order.findUnique.mockResolvedValue(null);
      await expect(service.recordInvite(token, 'INVITE_SHOWN')).rejects.toThrow(
        'Pedido no encontrado',
      );
      prisma.order.findUnique.mockResolvedValue({
        ...base,
        accessTokenRevokedAt: new Date(),
      });
      await expect(service.recordInvite(token, 'INVITE_SHOWN')).rejects.toThrow(
        'Pedido no encontrado',
      );
    });
  });

  it('lists only events marked visible to the buyer', async () => {
    prisma.orderEvent.findMany.mockResolvedValue([]);

    await service.listForBuyer('order-1');

    expect(prisma.orderEvent.findMany).toHaveBeenCalledWith({
      where: { orderId: 'order-1', visibleToBuyer: true },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      select: { type: true, actor: true, createdAt: true, payload: true },
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
        claimedAt: true,
        buyerAccountId: true,
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
      // The documented response shape, and nothing else.
      expect(Object.keys(result)).toEqual(['receiptConfirmedAt']);

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

  describe('claim ticket checks', () => {
    const { token } = createOrderAccessToken();
    const base = {
      id: 'order-1',
      storeId: 'store-1',
      source: 'VENDOR_ASSISTED',
      status: 'ACTIVE',
      paymentStatus: 'VERIFIED',
      claimedAt: null,
      buyerAccountId: null,
      accessTokenHash: 'h'.repeat(64),
      accessTokenRevokedAt: null,
      payments: [
        {
          amount: new Prisma.Decimal(10),
          source: 'SELLER_RECORDED' as const,
          reviewStatus: 'N_A' as const,
          voidedAt: null,
        },
      ],
    };

    it('answers the same 404 for an unknown and a revoked token', async () => {
      prisma.order.findUnique.mockResolvedValueOnce(null);
      await expect(service.loadForClaim(token)).rejects.toThrow(
        'Pedido no encontrado',
      );
      prisma.order.findUnique.mockResolvedValueOnce({
        ...base,
        accessTokenRevokedAt: new Date(),
      });
      await expect(service.loadForClaim(token)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('looks the order up by the token hash only', async () => {
      prisma.order.findUnique.mockResolvedValueOnce(base);
      await service.loadForClaim(token);
      const arg = prisma.order.findUnique.mock.calls.at(-1)![0];
      expect(Object.keys(arg.where)).toEqual(['accessTokenHash']);
      expect(arg.where.accessTokenHash).not.toBe(token);
    });

    it('accepts an assisted, active, validated, unclaimed order', () => {
      expect(() => service.assertClaimable(base)).not.toThrow();
    });

    it('answers 409 when claimed and 422 when not claimable', () => {
      expect(() =>
        service.assertClaimable({ ...base, claimedAt: new Date() }),
      ).toThrow(ConflictException);
      expect(() =>
        service.assertClaimable({ ...base, buyerAccountId: 'b1' }),
      ).toThrow(ConflictException);
      for (const patch of [
        { source: 'MARKETPLACE' },
        { status: 'CANCELLED' },
        { paymentStatus: 'CANCELLED' },
        { payments: [] },
      ]) {
        expect(() => service.assertClaimable({ ...base, ...patch })).toThrow(
          UnprocessableEntityException,
        );
      }
    });
  });
});
