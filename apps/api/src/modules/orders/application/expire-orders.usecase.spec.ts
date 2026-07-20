import { Test, TestingModule } from '@nestjs/testing';
import { vi, type Mock } from 'vitest';
import { ExpireOrdersUseCase } from './expire-orders.usecase.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

describe('ExpireOrdersUseCase', () => {
  let useCase: ExpireOrdersUseCase;
  let prisma: {
    order: { findMany: Mock; update: Mock };
    productVariant: { findUnique: Mock; update: Mock };
    $transaction: Mock;
  };

  beforeEach(async () => {
    prisma = {
      order: { findMany: vi.fn(), update: vi.fn() },
      productVariant: { findUnique: vi.fn(), update: vi.fn() },
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [ExpireOrdersUseCase, { provide: PrismaService, useValue: prisma }],
    }).compile();

    useCase = module.get(ExpireOrdersUseCase);
  });

  it('cancels expired PENDING_PAYMENT orders and releases finite-stock holds', async () => {
    prisma.order.findMany.mockResolvedValue([
      { id: 'order-1', items: [{ variantId: 'variant-1', quantity: 2 }] },
    ]);
    prisma.productVariant.findUnique.mockResolvedValue({ id: 'variant-1', stock: 5 });

    const result = await useCase.execute();

    expect(prisma.productVariant.update).toHaveBeenCalledWith({
      where: { id: 'variant-1' },
      data: { reserved: { decrement: 2 } },
    });
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: 'order-1' },
      data: { paymentStatus: 'CANCELLED' },
    });
    expect(result).toEqual({ cancelled: 1 });
  });

  it('skips releasing stock for unlimited (null stock) variants', async () => {
    prisma.order.findMany.mockResolvedValue([
      { id: 'order-1', items: [{ variantId: 'variant-1', quantity: 1 }] },
    ]);
    prisma.productVariant.findUnique.mockResolvedValue({ id: 'variant-1', stock: null });

    await useCase.execute();

    expect(prisma.productVariant.update).not.toHaveBeenCalled();
  });

  it('returns cancelled: 0 when nothing has expired', async () => {
    prisma.order.findMany.mockResolvedValue([]);

    const result = await useCase.execute();

    expect(result).toEqual({ cancelled: 0 });
    expect(prisma.order.update).not.toHaveBeenCalled();
  });
});
