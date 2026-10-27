import { Test, type TestingModule } from '@nestjs/testing';
import {
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { type Mock, vi } from 'vitest';
import { Prisma } from '@biasmarket/db';
import { hashOrderAccessToken } from '@biasmarket/utils/assisted-order';
import { PublicOrderService } from './public-order.service.js';
import { OrderEventsService } from './order-events.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

describe('PublicOrderService', () => {
  let service: PublicOrderService;
  let events: {
    requireOrderForToken: Mock;
    record: Mock;
  };
  let prisma: {
    order: { findUnique: Mock; updateMany: Mock };
    paymentMethodConfig: { findMany: Mock };
    $transaction: Mock;
  };

  const orderRow = {
    id: 'order-1',
    storeId: 'store-1',
    createdByUserId: 'seller-1',
    customerPhone: '+51987654321',
    customerEmail: 'buyer@example.com',
    customerName: 'Ana',
    totalAmount: new Prisma.Decimal('100.00'),
    requiredAmount: new Prisma.Decimal('100.00'),
    currency: 'PEN',
    paymentStatus: 'PENDING_PAYMENT',
    fulfillmentStatus: 'ORDERING',
    status: 'ACTIVE',
    deliveryMethodType: 'COURIER',
    deliveryDetails: {
      shippingAddress: {
        line1: 'Jr. Lima 1',
        district: 'Lima',
        city: 'Lima',
        reference: 'Portón azul',
        recipientName: 'Ana',
        phone: '+51987654321',
        documentNumber: '12345678',
      },
    },
    pickupDate: null,
    courierName: 'Olva',
    courierModality: 'HOME',
    linkFirstOpenedAt: null,
    store: {
      name: 'Tienda',
      slug: 'tienda',
      logoUrl: null,
      whatsappNumber: '+51911111111',
      paymentInstructions: 'Yape al número de la tienda',
    },
    items: [
      {
        quantity: 1,
        unitPriceAtPurchase: new Prisma.Decimal('100.00'),
        currency: 'PEN',
        product: { name: 'Lightstick' },
      },
    ],
    payments: [
      {
        amount: new Prisma.Decimal('40.00'),
        source: 'SELLER_RECORDED',
        reviewStatus: 'N_A',
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
        imageUrl: 'https://private.example/proof.jpg',
        note: 'internal',
      },
    ],
  };

  beforeEach(async () => {
    events = {
      requireOrderForToken: vi.fn(),
      record: vi.fn(),
    };
    prisma = {
      order: {
        findUnique: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      paymentMethodConfig: { findMany: vi.fn().mockResolvedValue([]) },
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicOrderService,
        { provide: OrderEventsService, useValue: events },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(PublicOrderService);
  });

  it('returns a minimal order and masks the phone', async () => {
    events.requireOrderForToken.mockResolvedValue({
      id: 'order-1',
      storeId: 'store-1',
    });
    prisma.order.findUnique.mockResolvedValue(orderRow);

    const result = await service.getByToken('raw-token');

    expect(result.customerPhone).toBe('+51 9** *** 321');
    expect(result.store).toEqual({
      name: 'Tienda',
      slug: 'tienda',
      logoUrl: null,
      whatsappNumber: '+51911111111',
    });
    expect(result.items).toEqual([
      {
        name: 'Lightstick',
        quantity: 1,
        unitPrice: '100',
        currency: 'PEN',
      },
    ]);
    expect(result.payments).toEqual([
      {
        source: 'SELLER_RECORDED',
        amount: '40',
        createdAt: '2026-10-01T00:00:00.000Z',
        reviewStatus: 'N_A',
      },
    ]);
    expect(result.paidAmount).toBe(40);
    expect(result.pendingAmount).toBe(60);
    expect(JSON.stringify(result)).not.toContain('store-1');
    expect(JSON.stringify(result)).not.toContain('seller-1');
    expect(JSON.stringify(result)).not.toContain('buyer@example.com');
    expect(JSON.stringify(result)).not.toContain('proof.jpg');
    expect(JSON.stringify(result)).not.toContain('internal');
    expect(result).not.toHaveProperty('storeId');
    expect(result).not.toHaveProperty('createdByUserId');
  });

  it('returns only payment methods that are actually configured', async () => {
    events.requireOrderForToken.mockResolvedValue({
      id: 'order-1',
      storeId: 'store-1',
    });
    prisma.order.findUnique.mockResolvedValue(orderRow);
    prisma.paymentMethodConfig.findMany.mockResolvedValue([
      {
        method: 'YAPE',
        depositPercent: 50,
        details: { phoneNumber: '999888777' },
      },
      { method: 'PLIN', depositPercent: 50, details: {} },
      { method: 'CASH', depositPercent: 100, details: {} },
    ]);

    const result = await service.getByToken('raw-token');

    expect(result.paymentMethods.map((method) => method.method)).toEqual([
      'YAPE',
      'CASH',
    ]);
    expect(result.paymentInstructions).toBe('Yape al número de la tienda');
  });

  it('omits payment instructions and methods once the order is cancelled', async () => {
    events.requireOrderForToken.mockResolvedValue({
      id: 'order-1',
      storeId: 'store-1',
    });
    prisma.order.findUnique.mockResolvedValue({
      ...orderRow,
      status: 'CANCELLED',
      paymentStatus: 'CANCELLED',
    });

    const result = await service.getByToken('raw-token');

    expect(result.paymentMethods).toEqual([]);
    expect(result.paymentInstructions).toBeNull();
    expect(prisma.paymentMethodConfig.findMany).not.toHaveBeenCalled();
  });

  it('fails closed when recording the first open fails', async () => {
    events.requireOrderForToken.mockResolvedValue({
      id: 'order-1',
      storeId: 'store-1',
    });
    prisma.order.findUnique.mockResolvedValue(orderRow);
    prisma.$transaction.mockRejectedValueOnce(new Error('insert failed'));

    await expect(service.getByToken('raw-token')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );

    expect(events.record).not.toHaveBeenCalled();
  });

  it('projects deliveryDetails to an allow-list instead of the stored blob', async () => {
    events.requireOrderForToken.mockResolvedValue({
      id: 'order-1',
      storeId: 'store-1',
    });
    prisma.order.findUnique.mockResolvedValue(orderRow);

    const result = await service.getByToken('raw-token');

    expect(result.deliveryDetails).toEqual({
      line1: 'Jr. Lima 1',
      district: 'Lima',
      city: 'Lima',
      reference: 'Portón azul',
      pickupPointLabel: null,
    });
    expect(JSON.stringify(result)).not.toContain('12345678');
    expect(JSON.stringify(result)).not.toContain('recipientName');
  });

  it('records LINK_OPENED once, on the first read', async () => {
    events.requireOrderForToken.mockResolvedValue({
      id: 'order-1',
      storeId: 'store-1',
    });
    prisma.order.findUnique.mockResolvedValue(orderRow);
    prisma.order.updateMany.mockResolvedValueOnce({ count: 1 });

    await service.getByToken('raw-token');

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 15_000,
    });
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'order-1',
        accessTokenHash: hashOrderAccessToken('raw-token'),
        accessTokenRevokedAt: null,
        linkFirstOpenedAt: null,
      },
      data: { linkFirstOpenedAt: expect.any(Date) },
    });
    expect(events.record).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({ type: 'LINK_OPENED', actor: 'BUYER' }),
    );

    events.record.mockClear();
    prisma.order.findUnique.mockResolvedValue({
      ...orderRow,
      linkFirstOpenedAt: new Date('2026-10-02T00:00:00.000Z'),
    });
    await service.getByToken('raw-token');
    expect(events.record).not.toHaveBeenCalled();
  });

  it('stamps nothing and records no event when the token was rotated mid-read', async () => {
    events.requireOrderForToken.mockResolvedValue({
      id: 'order-1',
      storeId: 'store-1',
    });
    prisma.order.findUnique.mockResolvedValue(orderRow);
    prisma.order.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await service.getByToken('old-token');

    expect(result.customerPhone).toBe('+51 9** *** 321');
    expect(events.record).not.toHaveBeenCalled();
  });

  it('skips the open-marking write on a repeat read of an already-opened link', async () => {
    events.requireOrderForToken.mockResolvedValue({
      id: 'order-1',
      storeId: 'store-1',
    });
    prisma.order.findUnique.mockResolvedValue({
      ...orderRow,
      linkFirstOpenedAt: new Date('2026-10-02T00:00:00.000Z'),
    });

    await service.getByToken('raw-token');

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(events.record).not.toHaveBeenCalled();
  });

  it('uses the same not-found error for an invalid or revoked token', async () => {
    events.requireOrderForToken.mockRejectedValue(
      new NotFoundException('Pedido no encontrado'),
    );

    await expect(service.getByToken('nope')).rejects.toThrow(
      'Pedido no encontrado',
    );
    await expect(service.getByToken('revoked')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.order.findUnique).not.toHaveBeenCalled();
  });
});
