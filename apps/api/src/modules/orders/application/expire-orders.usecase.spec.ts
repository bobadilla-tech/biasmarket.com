import { Test, type TestingModule } from '@nestjs/testing';
import { type Mock, vi } from 'vitest';
import { Prisma } from '@biasmarket/db';
import { ExpireOrdersUseCase } from './expire-orders.usecase.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';

const order = (overrides: Record<string, unknown> = {}) => ({
  id: 'order-1',
  storeId: 'store-1',
  paymentStatus: 'PENDING_PAYMENT',
  fulfillmentStatus: 'ORDERING',
  requiredAmount: new Prisma.Decimal(100),
  payments: [],
  ...overrides,
});

describe('ExpireOrdersUseCase', () => {
  let useCase: ExpireOrdersUseCase;
  let prisma: {
    order: { findMany: Mock; updateMany: Mock };
    auditLog: { create: Mock };
    productVariant: { findUnique: Mock; update: Mock };
    store: { findUnique: Mock };
    product: { findUnique: Mock };
    $transaction: Mock;
  };

  beforeEach(async () => {
    prisma = {
      order: {
        findMany: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: vi.fn() },
      productVariant: { findUnique: vi.fn(), update: vi.fn() },
      store: { findUnique: vi.fn() },
      product: { findUnique: vi.fn() },
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpireOrdersUseCase,
        { provide: PrismaService, useValue: prisma },
        {
          provide: NotificationsService,
          useValue: { syncStockAlerts: vi.fn() },
        },
      ],
    }).compile();

    useCase = module.get(ExpireOrdersUseCase);
  });

  it('cancels expired PENDING_PAYMENT orders and releases finite-stock holds', async () => {
    prisma.order.findMany.mockResolvedValue([
      order({
        id: 'order-1',
        items: [{ variantId: 'variant-1', quantity: 2 }],
      }),
    ]);
    prisma.productVariant.findUnique.mockResolvedValue({
      id: 'variant-1',
      stock: 5,
    });

    const result = await useCase.execute();

    expect(prisma.productVariant.update).toHaveBeenCalledWith({
      where: { id: 'variant-1' },
      data: { reserved: { decrement: 2 } },
    });
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'order-1',
        paymentStatus: {
          in: ['PENDING_PAYMENT', 'PARTIALLY_PAID', 'PAYMENT_SUBMITTED'],
        },
      },
      data: {
        status: 'CANCELLED',
        paymentStatus: 'CANCELLED',
        cancellationResolution: 'RETAINED',
        retainedAmount: new Prisma.Decimal(0),
        releasedAmount: new Prisma.Decimal(0),
        releasedResolution: null,
      },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'system',
        storeId: 'store-1',
        action: 'order.expired',
        entityType: 'Order',
        entityId: 'order-1',
        metadata: {
          resolution: 'RETAINED',
          retainedAmount: 0,
          releasedAmount: 0,
        },
      },
    });
    expect(result).toEqual({ cancelled: 1 });
  });

  it('skips releasing stock for unlimited (null stock) variants', async () => {
    prisma.order.findMany.mockResolvedValue([
      order({
        id: 'order-1',
        items: [{ variantId: 'variant-1', quantity: 1 }],
      }),
    ]);
    prisma.productVariant.findUnique.mockResolvedValue({
      id: 'variant-1',
      stock: null,
    });

    await useCase.execute();

    expect(prisma.productVariant.update).not.toHaveBeenCalled();
  });

  it('releases stock for expired PARTIALLY_PAID orders that were abandoned', async () => {
    prisma.order.findMany.mockResolvedValue([
      order({
        id: 'order-2',
        items: [{ variantId: 'variant-1', quantity: 3 }],
        payments: [
          {
            amount: new Prisma.Decimal(30),
            source: 'SELLER_RECORDED',
            reviewStatus: 'N_A',
          },
        ],
      }),
    ]);
    prisma.productVariant.findUnique.mockResolvedValue({
      id: 'variant-1',
      stock: 5,
    });

    const result = await useCase.execute();

    expect(prisma.productVariant.update).toHaveBeenCalledWith({
      where: { id: 'variant-1' },
      data: { reserved: { decrement: 3 } },
    });
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'order-2',
        paymentStatus: {
          in: ['PENDING_PAYMENT', 'PARTIALLY_PAID', 'PAYMENT_SUBMITTED'],
        },
      },
      data: {
        status: 'CANCELLED',
        paymentStatus: 'CANCELLED',
        cancellationResolution: 'RETAINED',
        retainedAmount: new Prisma.Decimal(30),
        releasedAmount: new Prisma.Decimal(0),
        releasedResolution: null,
      },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: 'system',
        storeId: 'store-1',
        action: 'order.expired',
        entityType: 'Order',
        entityId: 'order-2',
        metadata: {
          resolution: 'RETAINED',
          retainedAmount: 30,
          releasedAmount: 0,
        },
      },
    });
    expect(result).toEqual({ cancelled: 1 });
  });

  it('returns cancelled: 0 when nothing has expired', async () => {
    prisma.order.findMany.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result).toEqual({ cancelled: 0 });
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it("skips stock mutation when another request already changed the order's status", async () => {
    prisma.order.findMany.mockResolvedValue([
      order({
        id: 'order-1',
        items: [{ variantId: 'variant-1', quantity: 2 }],
      }),
    ]);
    prisma.order.updateMany.mockResolvedValue({ count: 0 });

    const result = await useCase.execute();

    expect(prisma.productVariant.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(result).toEqual({ cancelled: 0 });
  });
});
