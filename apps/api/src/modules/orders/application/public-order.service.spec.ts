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
    listForBuyer: Mock;
  };
  let prisma: {
    order: { findUnique: Mock; updateMany: Mock };
    paymentMethodConfig: { findMany: Mock };
    orderPayment?: { findFirst: Mock };
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
    createdAt: new Date('2026-09-30T12:00:00.000Z'),
    claimedAt: null,
    buyerConfirmedReceivedAt: null,
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
    trackingNumber: 'OLV123456',
    trackingUrl: 'https://tracking.example/OLV123456',
    packedPhotoUrl: 'https://private.example/packed.jpg',
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
    expiresAt: new Date('2026-10-05T12:00:00.000Z'),
    cancellationReason: null,
    paymentRejectionReason: null,
    payments: [
      {
        id: 'payment-1',
        amount: new Prisma.Decimal('40.00'),
        source: 'SELLER_RECORDED',
        method: 'YAPE',
        reviewStatus: 'N_A',
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
        paidAt: new Date('2026-09-30T17:00:00.000Z'),
        voidedAt: null,
        imageUrl: 'https://private.example/proof.jpg',
        operationCode: 'OP123',
        recordedByUserId: 'seller-1',
        voidReason: 'secret',
        note: 'internal',
      },
    ],
  };

  beforeEach(async () => {
    events = {
      requireOrderForToken: vi.fn(),
      record: vi.fn(),
      listForBuyer: vi.fn().mockResolvedValue([]),
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
    expect(result.customerAlias).toBe('Ana');
    expect(result.orderNumber).toBe('ER-1');
    expect(result.createdAt).toBe('2026-09-30T12:00:00.000Z');
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
        id: 'payment-1',
        source: 'SELLER_RECORDED',
        method: 'YAPE',
        amount: '40',
        createdAt: '2026-10-01T00:00:00.000Z',
        paidAt: '2026-09-30T17:00:00.000Z',
        reviewStatus: 'N_A',
        voidedAt: null,
        hasProof: false,
      },
    ]);
    expect(result.paidAmount).toBe(40);
    expect(result.pendingAmount).toBe(60);
    expect(result.trackingNumber).toBe('OLV123456');
    expect(result.trackingUrl).toBe('https://tracking.example/OLV123456');
    expect(result.packedPhotoAvailable).toBe(true);
    expect(JSON.stringify(result)).not.toContain('store-1');
    expect(JSON.stringify(result)).not.toContain('seller-1');
    expect(JSON.stringify(result)).not.toContain('buyer@example.com');
    expect(JSON.stringify(result)).not.toContain('proof.jpg');
    expect(JSON.stringify(result)).not.toContain('packed.jpg');
    expect(JSON.stringify(result)).not.toContain('internal');
    expect(JSON.stringify(result)).not.toContain('OP123');
    expect(JSON.stringify(result)).not.toContain('secret');
    expect(result).not.toHaveProperty('storeId');
    expect(result).not.toHaveProperty('createdByUserId');
  });

  it('returns exactly the allow-listed keys and never the order id', async () => {
    events.requireOrderForToken.mockResolvedValue({
      id: 'order-1',
      storeId: 'store-1',
    });
    prisma.order.findUnique.mockResolvedValue({
      ...orderRow,
      id: 'cmabcdefgh1234wxyz',
      accessTokenHash: 'hash-secret',
    });

    const result = await service.getByToken('raw-token');

    expect(Object.keys(result).sort()).toEqual(
      [
        'store',
        'customerPhone',
        'customerAlias',
        'orderNumber',
        'createdAt',
        'items',
        'totalAmount',
        'requiredAmount',
        'paidAmount',
        'pendingAmount',
        'currency',
        'paymentStatus',
        'fulfillmentStatus',
        'status',
        'paymentInstructions',
        'paymentMethods',
        'deliveryMethodType',
        'deliveryDetails',
        'pickupDate',
        'courierName',
        'trackingNumber',
        'trackingUrl',
        'packedPhotoAvailable',
        'receiptConfirmedAt',
        'claimed',
        'lastUpdateAt',
        'timeline',
        'hasValidatedPayment',
        'courierModality',
        'payments',
        'expiresAt',
        'paymentRejectionReason',
        'closure',
      ].sort(),
    );
    expect(result.orderNumber).toBe('WXYZ');
    expect(JSON.stringify(result)).not.toContain('cmabcdefgh1234wxyz');
    expect(JSON.stringify(result)).not.toContain('hash-secret');
  });

  it('sanitises the alias and yields null for a blank name', async () => {
    events.requireOrderForToken.mockResolvedValue({
      id: 'order-1',
      storeId: 'store-1',
    });
    prisma.order.findUnique.mockResolvedValueOnce({
      ...orderRow,
      customerName: '\u202E  Sofi\n\tLee ',
    });
    expect((await service.getByToken('raw-token')).customerAlias).toBe(
      'Sofi Lee',
    );
    prisma.order.findUnique.mockResolvedValueOnce({
      ...orderRow,
      customerName: null,
    });
    expect((await service.getByToken('raw-token')).customerAlias).toBeNull();
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

  describe('timeline', () => {
    const at = (iso: string) => new Date(iso);
    const events_ = [
      {
        type: 'CREATED',
        createdAt: at('2026-09-30T12:00:00.000Z'),
        payload: {},
      },
      {
        type: 'LINK_OPENED',
        createdAt: at('2026-09-30T12:05:00.000Z'),
        payload: {},
      },
      {
        type: 'BUYER_NOTIFIED',
        createdAt: at('2026-09-30T12:06:00.000Z'),
        payload: { notice: 'ASSISTED_READY' },
      },
      {
        type: 'PAYMENT_VOIDED',
        createdAt: at('2026-10-01T10:00:00.000Z'),
        payload: {
          amount: 20,
          currency: 'PEN',
          paymentId: 'payment-secret',
          reason: 'seller free text',
        },
      },
      {
        type: 'FULFILLMENT_ADVANCED',
        createdAt: at('2026-10-02T10:00:00.000Z'),
        payload: { fromStatus: 'ORDERING', toStatus: 'IN_TRANSIT' },
      },
      {
        type: 'ORDER_CANCELLED',
        createdAt: at('2026-10-03T10:00:00.000Z'),
        payload: { resolution: 'free text from seller' },
      },
    ];

    async function load(claimedAt: Date | null) {
      events.requireOrderForToken.mockResolvedValue({
        id: 'order-1',
        storeId: 'store-1',
      });
      prisma.order.findUnique.mockResolvedValueOnce({
        ...orderRow,
        claimedAt,
        linkFirstOpenedAt: new Date(),
      });
      events.listForBuyer.mockResolvedValue(events_);
      return service.getByToken('tok');
    }

    it('gives an unclaimed order an empty timeline but still the last update', async () => {
      const result = await load(null);

      expect(result.claimed).toBe(false);
      expect(result.timeline).toEqual([]);
      // The latest buyer-visible step, not the internal ones.
      expect(result.lastUpdateAt).toBe('2026-10-03T10:00:00.000Z');
    });

    it('gives a claimed order the ordered steps, without internal events', async () => {
      const result = await load(new Date());

      expect(result.claimed).toBe(true);
      expect(result.timeline.map((item) => item.type)).toEqual([
        'CREATED',
        'PAYMENT_VOIDED',
        'FULFILLMENT_ADVANCED',
        'ORDER_CANCELLED',
      ]);
    });

    it('exposes exactly the picked keys per item and never the payload extras', async () => {
      const result = await load(new Date());

      for (const item of result.timeline) {
        expect(Object.keys(item).sort()).toEqual(
          ['amount', 'at', 'resolution', 'toStatus', 'type'].sort(),
        );
      }
      const voided = result.timeline.find((i) => i.type === 'PAYMENT_VOIDED')!;
      expect(voided.amount).toBe('20');
      const advanced = result.timeline.find(
        (i) => i.type === 'FULFILLMENT_ADVANCED',
      )!;
      expect(advanced.toStatus).toBe('IN_TRANSIT');
      // Free text in `resolution` is not a known value: dropped.
      expect(
        result.timeline.find((i) => i.type === 'ORDER_CANCELLED')!.resolution,
      ).toBeNull();
      const json = JSON.stringify(result);
      for (const secret of [
        'payment-secret',
        'seller free text',
        'free text from seller',
        'ASSISTED_READY',
      ]) {
        expect(json).not.toContain(secret);
      }
    });

    it('falls back to the creation time with no buyer-visible step', async () => {
      events.requireOrderForToken.mockResolvedValue({
        id: 'order-1',
        storeId: 'store-1',
      });
      prisma.order.findUnique.mockResolvedValueOnce({
        ...orderRow,
        linkFirstOpenedAt: new Date(),
      });
      events.listForBuyer.mockResolvedValue([events_[1]]);

      const result = await service.getByToken('tok');

      expect(result.lastUpdateAt).toBe(orderRow.createdAt.toISOString());
    });

    it('computes hasValidatedPayment from payments that count toward paid', async () => {
      events.requireOrderForToken.mockResolvedValue({
        id: 'order-1',
        storeId: 'store-1',
      });
      const row = (payments: unknown[]) =>
        prisma.order.findUnique.mockResolvedValueOnce({
          ...orderRow,
          linkFirstOpenedAt: new Date(),
          payments,
        });
      const base = {
        amount: new Prisma.Decimal('10'),
        createdAt: new Date(),
        voidedAt: null,
      };

      row([{ ...base, source: 'SELLER_RECORDED', reviewStatus: 'N_A' }]);
      expect((await service.getByToken('t')).hasValidatedPayment).toBe(true);
      row([{ ...base, source: 'BUYER_SUBMITTED', reviewStatus: 'APPROVED' }]);
      expect((await service.getByToken('t')).hasValidatedPayment).toBe(true);
      row([
        { ...base, source: 'BUYER_SUBMITTED', reviewStatus: 'PENDING_REVIEW' },
      ]);
      expect((await service.getByToken('t')).hasValidatedPayment).toBe(false);
      row([
        {
          ...base,
          source: 'SELLER_RECORDED',
          reviewStatus: 'N_A',
          voidedAt: new Date(),
        },
      ]);
      expect((await service.getByToken('t')).hasValidatedPayment).toBe(false);
      row([]);
      expect((await service.getByToken('t')).hasValidatedPayment).toBe(false);
    });
  });

  describe('payment, closure and deadline fields', () => {
    const open = (overrides: Record<string, unknown> = {}) => {
      events.requireOrderForToken.mockResolvedValue({
        id: 'order-1',
        storeId: 'store-1',
      });
      prisma.order.findUnique.mockResolvedValueOnce({
        ...orderRow,
        ...overrides,
      });
      return service.getByToken('raw-token');
    };

    it('flags hasProof only for a buyer upload that has an image', async () => {
      const row = (id: string, source: string, imageUrl: string | null) => ({
        ...orderRow.payments[0],
        id,
        source,
        imageUrl,
      });
      const result = await open({
        payments: [
          row('a', 'BUYER_SUBMITTED', 'https://private.example/a.jpg'),
          row('b', 'BUYER_SUBMITTED', null),
          row('c', 'SELLER_RECORDED', 'https://private.example/c.jpg'),
        ],
      });
      expect(result.payments.map((p) => p.hasProof)).toEqual([
        true,
        false,
        false,
      ]);
      expect(JSON.stringify(result)).not.toContain('private.example');
    });

    it('exposes expiresAt only while active and awaiting payment', async () => {
      expect((await open()).expiresAt).toBe('2026-10-05T12:00:00.000Z');
      expect((await open({ paymentStatus: 'VERIFIED' })).expiresAt).toBeNull();
      expect(
        (await open({ status: 'CANCELLED', paymentStatus: 'CANCELLED' }))
          .expiresAt,
      ).toBeNull();
    });

    it('exposes a sanitized rejection reason only when REJECTED', async () => {
      const reason = '\u202eFoto\nilegible\u200b';
      expect(
        (
          await open({
            paymentStatus: 'REJECTED',
            paymentRejectionReason: reason,
          })
        ).paymentRejectionReason,
      ).toBe('Foto ilegible');
      expect(
        (await open({ paymentRejectionReason: reason })).paymentRejectionReason,
      ).toBeNull();
      const long = 'x'.repeat(900);
      const out = (
        await open({ paymentStatus: 'REJECTED', paymentRejectionReason: long })
      ).paymentRejectionReason;
      expect(out).toHaveLength(500);
    });

    it('has no closure for a live order', async () => {
      expect((await open()).closure).toBeNull();
    });

    it('tells a seller cancellation from an expiry by the last event actor', async () => {
      const cancelled = { status: 'CANCELLED', paymentStatus: 'CANCELLED' };
      const at = new Date('2026-10-02T00:00:00.000Z');
      events.listForBuyer.mockResolvedValueOnce([
        {
          type: 'ORDER_CANCELLED',
          actor: 'SELLER',
          createdAt: at,
          payload: {},
        },
      ]);
      expect(
        (
          await open({
            ...cancelled,
            cancellationReason: 'Sin stock\nLo siento',
          })
        ).closure,
      ).toEqual({ kind: 'CANCELLED', reason: 'Sin stock Lo siento' });

      events.listForBuyer.mockResolvedValueOnce([
        {
          type: 'ORDER_CANCELLED',
          actor: 'SYSTEM',
          createdAt: at,
          payload: {},
        },
      ]);
      expect((await open(cancelled)).closure).toEqual({
        kind: 'EXPIRED',
        reason: null,
      });

      // Only the last cancellation counts.
      events.listForBuyer.mockResolvedValueOnce([
        {
          type: 'ORDER_CANCELLED',
          actor: 'SYSTEM',
          createdAt: at,
          payload: {},
        },
        {
          type: 'ORDER_CANCELLED',
          actor: 'SELLER',
          createdAt: at,
          payload: {},
        },
      ]);
      expect((await open(cancelled)).closure?.kind).toBe('CANCELLED');
    });

    it('treats a legacy cancelled order without an event as CANCELLED', async () => {
      expect(
        (await open({ status: 'CANCELLED', paymentStatus: 'CANCELLED' }))
          .closure,
      ).toEqual({ kind: 'CANCELLED', reason: null });
    });
  });

  describe('getBuyerProofImageUrl', () => {
    it('queries by payment id, order id, buyer source and image in one call', async () => {
      prisma.orderPayment = {
        findFirst: vi.fn().mockResolvedValue({ imageUrl: 'https://x/y.jpg' }),
      };
      await expect(
        service.getBuyerProofImageUrl('order-1', 'payment-9'),
      ).resolves.toBe('https://x/y.jpg');
      expect(prisma.orderPayment.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'payment-9',
          orderId: 'order-1',
          source: 'BUYER_SUBMITTED',
          imageUrl: { not: null },
        },
        select: { imageUrl: true },
      });
    });

    it('answers the same 404 for every miss', async () => {
      prisma.orderPayment = { findFirst: vi.fn().mockResolvedValue(null) };
      await expect(
        service.getBuyerProofImageUrl('order-1', 'nope'),
      ).rejects.toThrow('Comprobante no encontrado');
    });
  });
});
