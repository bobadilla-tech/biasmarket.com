import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { vi, type Mock } from 'vitest';
import { AdvanceFulfillmentUseCase } from './advance-fulfillment.usecase.js';
import { OrderRepository } from '../infrastructure/order.repository.js';
import { InvalidOrderTransitionError } from '../domain/order-status.vo.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

describe('AdvanceFulfillmentUseCase', () => {
  let useCase: AdvanceFulfillmentUseCase;
  let prisma: {
    store: { findUnique: Mock };
    order: { findUnique: Mock; update: Mock };
  };

  const ownerId = 'user-1';
  const storeId = 'store-1';
  const orderId = 'order-1';

  beforeEach(async () => {
    prisma = {
      store: { findUnique: vi.fn() },
      order: { findUnique: vi.fn(), update: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdvanceFulfillmentUseCase,
        OrderRepository,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    useCase = module.get(AdvanceFulfillmentUseCase);
    prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
  });

  it('throws ForbiddenException when the user does not own the store', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId: 'someone-else' });

    await expect(
      useCase.execute(orderId, storeId, ownerId, 'IN_TRANSIT'),
    ).rejects.toThrow(ForbiddenException);
  });

  it('throws BadRequestException when payment is not yet VERIFIED', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: orderId,
      storeId,
      paymentStatus: 'PENDING_PAYMENT',
      fulfillmentStatus: 'ORDERING',
      items: [],
    });

    await expect(
      useCase.execute(orderId, storeId, ownerId, 'IN_TRANSIT'),
    ).rejects.toThrow(BadRequestException);
  });

  it('advances fulfillment when payment is VERIFIED', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: orderId,
      storeId,
      paymentStatus: 'VERIFIED',
      fulfillmentStatus: 'ORDERING',
      items: [],
    });
    prisma.order.update.mockResolvedValue({ id: orderId, fulfillmentStatus: 'IN_TRANSIT' });

    await useCase.execute(orderId, storeId, ownerId, 'IN_TRANSIT');

    expect(prisma.order.update).toHaveBeenCalledWith({
      where: { id: orderId },
      data: { fulfillmentStatus: 'IN_TRANSIT' },
    });
  });

  it('rejects skipping a fulfillment state', async () => {
    prisma.order.findUnique.mockResolvedValue({
      id: orderId,
      storeId,
      paymentStatus: 'VERIFIED',
      fulfillmentStatus: 'ORDERING',
      items: [],
    });

    await expect(
      useCase.execute(orderId, storeId, ownerId, 'COMPLETED'),
    ).rejects.toThrow(InvalidOrderTransitionError);
  });
});
