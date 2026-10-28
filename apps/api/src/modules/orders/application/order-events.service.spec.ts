import { Test, type TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { type Mock, vi } from 'vitest';
import { createOrderAccessToken } from '@biasmarket/utils/assisted-order';
import {
  OrderEventsService,
  sanitizeOrderEventPayload,
} from './order-events.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

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
    order: { findUnique: Mock };
    $transaction: Mock;
    $executeRaw: Mock;
  };

  beforeEach(async () => {
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
      },
      $executeRaw: vi.fn(),
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderEventsService,
        { provide: PrismaService, useValue: prisma },
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
        packedPhotoUrl: true,
      },
    });
  });
});
