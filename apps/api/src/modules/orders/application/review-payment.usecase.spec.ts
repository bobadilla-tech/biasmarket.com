import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { vi, type Mock } from 'vitest';
import { ReviewPaymentUseCase } from './review-payment.usecase.js';
import { OrderRepository } from '../infrastructure/order.repository.js';
import { InvalidOrderTransitionError } from '../domain/order-status.vo.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

describe('ReviewPaymentUseCase', () => {
  let useCase: ReviewPaymentUseCase;
  let prisma: {
    store: { findUnique: Mock };
    order: { findUnique: Mock; update: Mock };
    productVariant: { findUnique: Mock; update: Mock };
    auditLog: { create: Mock };
    $transaction: Mock;
  };

  const ownerId = 'user-1';
  const storeId = 'store-1';
  const orderId = 'order-1';

  beforeEach(async () => {
    prisma = {
      store: { findUnique: vi.fn() },
      order: { findUnique: vi.fn(), update: vi.fn() },
      productVariant: { findUnique: vi.fn(), update: vi.fn() },
      auditLog: { create: vi.fn() },
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewPaymentUseCase,
        OrderRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    useCase = module.get(ReviewPaymentUseCase);

    prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
  });

  it('throws ForbiddenException when the user does not own the store', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId: 'someone-else' });

    await expect(useCase.execute(orderId, storeId, ownerId, 'approve')).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('throws NotFoundException when the order belongs to a different store', async () => {
    prisma.order.findUnique.mockResolvedValue({ id: orderId, storeId: 'other-store', items: [] });

    await expect(useCase.execute(orderId, storeId, ownerId, 'approve')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('approve() decrements reserved and stock for finite-stock variants and writes an audit log', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: orderId,
      storeId,
      paymentStatus: 'PENDING_PAYMENT',
      fulfillmentStatus: 'ORDERING',
      items: [{ variantId: 'variant-1', quantity: 2 }],
    });
    prisma.productVariant.findUnique.mockResolvedValue({
      id: 'variant-1',
      stock: 10,
      reserved: 2,
    });
    prisma.order.update.mockResolvedValue({ id: orderId, paymentStatus: 'VERIFIED' });

    await useCase.execute(orderId, storeId, ownerId, 'approve');

    expect(prisma.productVariant.update).toHaveBeenCalledWith({
      where: { id: 'variant-1' },
      data: { reserved: { decrement: 2 }, stock: { decrement: 2 } },
    });
    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: orderId },
      data: { paymentStatus: 'VERIFIED' },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        actorId: ownerId,
        storeId,
        action: 'payment.approved',
        entityType: 'Order',
        entityId: orderId,
        metadata: {},
      },
    });
  });

  it('reject() releases reserved stock without touching real stock', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: orderId,
      storeId,
      paymentStatus: 'PENDING_PAYMENT',
      fulfillmentStatus: 'ORDERING',
      items: [{ variantId: 'variant-1', quantity: 3 }],
    });
    prisma.productVariant.findUnique.mockResolvedValue({
      id: 'variant-1',
      stock: 10,
      reserved: 3,
    });
    prisma.order.update.mockResolvedValue({ id: orderId, paymentStatus: 'REJECTED' });

    await useCase.execute(orderId, storeId, ownerId, 'reject');

    expect(prisma.productVariant.update).toHaveBeenCalledWith({
      where: { id: 'variant-1' },
      data: { reserved: { decrement: 3 } },
    });
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: 'payment.rejected' }) }),
    );
  });

  it('skips stock adjustment for items with unlimited (null) stock variants', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: orderId,
      storeId,
      paymentStatus: 'PENDING_PAYMENT',
      fulfillmentStatus: 'ORDERING',
      items: [{ variantId: 'variant-1', quantity: 1 }],
    });
    prisma.productVariant.findUnique.mockResolvedValue({ id: 'variant-1', stock: null, reserved: 0 });
    prisma.order.update.mockResolvedValue({ id: orderId, paymentStatus: 'VERIFIED' });

    await useCase.execute(orderId, storeId, ownerId, 'approve');

    expect(prisma.productVariant.update).not.toHaveBeenCalled();
  });

  it('rejects approving an already-VERIFIED order', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: orderId,
      storeId,
      paymentStatus: 'VERIFIED',
      fulfillmentStatus: 'ORDERING',
      items: [],
    });

    await expect(useCase.execute(orderId, storeId, ownerId, 'approve')).rejects.toThrow(
      InvalidOrderTransitionError,
    );
  });
});
