import { type Mock, vi } from 'vitest';
import { AssistedOrderIdentityRetentionUseCase } from './assisted-order-identity-retention.usecase.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

describe('AssistedOrderIdentityRetentionUseCase', () => {
  let useCase: AssistedOrderIdentityRetentionUseCase;
  let prisma: {
    order: { findMany: Mock; updateMany: Mock; count: Mock };
    customer: { findUnique: Mock; updateMany: Mock };
    auditLog: { create: Mock };
    $transaction: Mock;
  };

  beforeEach(() => {
    prisma = {
      order: {
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(0),
      },
      customer: {
        findUnique: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: vi.fn() },
      $transaction: vi.fn((callback: (tx: unknown) => unknown) =>
        callback(prisma),
      ),
    };
    useCase = new AssistedOrderIdentityRetentionUseCase(
      prisma as unknown as PrismaService,
    );
  });

  it('erases closed claimed assisted orders on request and defers active orders', async () => {
    prisma.order.findMany.mockResolvedValue([
      {
        id: 'claimed-order',
        storeId: 'store-1',
        customerId: 'customer-1',
        customerPhone: '+51987654321',
        customerPhoneNormalized: '+51987654321',
        buyerAccountId: 'buyer-1',
        claimedAt: new Date('2026-10-01T00:00:00.000Z'),
        status: 'ACTIVE',
        fulfillmentStatus: 'COMPLETED',
        accessTokenRevokedAt: null,
      },
      {
        id: 'active-order',
        storeId: 'store-1',
        customerId: null,
        customerPhone: '+51987654321',
        customerPhoneNormalized: '+51987654321',
        buyerAccountId: null,
        claimedAt: null,
        status: 'ACTIVE',
        fulfillmentStatus: 'IN_TRANSIT',
        accessTokenRevokedAt: null,
      },
    ]);

    const result = await useCase.eraseOnBuyerRequest('store-1', '+51987654321', 'operator-1', 'PRIV-460');

    expect(result).toEqual({ anonymized: 1, deferred: 1 });
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          storeId: 'store-1',
          source: 'VENDOR_ASSISTED',
          buyerIdentityErasedAt: null,
          OR: [
            { customerPhoneNormalized: '+51987654321' },
            { customerPhoneNormalized: null },
          ],
        },
      }),
    );
    expect(prisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'claimed-order' }),
        data: expect.objectContaining({
          customerPhone: '',
          customerPhoneNormalized: null,
          customerName: null,
          buyerAccountId: null,
          accessTokenHash: null,
          deliveryDetails: {},
          buyerIdentityErasedAt: expect.any(Date),
        }),
      }),
    );
    expect(prisma.order.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.customer.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'customer-1',
          storeId: 'store-1',
          identityErasedAt: null,
        },
        data: expect.objectContaining({
          phone: 'erased:customer-1',
          name: null,
          email: null,
          passwordHash: null,
          identityErasedAt: expect.any(Date),
        }),
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'order.assisted_identity_erased',
          entityId: 'claimed-order',
          metadata: expect.objectContaining({ cause: 'BUYER_REQUEST' }),
        }),
      }),
    );
    expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain(
      '+51987654321',
      'operator-1',
      'PRIV-460',
    );
  });

  it('limits the scheduled cleanup to 90-day-old unclaimed assisted orders', async () => {
    const now = new Date('2026-10-29T12:00:00.000Z');
    prisma.order.findMany.mockResolvedValue([
      {
        id: 'old-order',
        storeId: 'store-1',
        customerId: null,
        status: 'CANCELLED',
        fulfillmentStatus: 'ORDERING',
        accessTokenRevokedAt: null,
      },
    ]);

    const result = await useCase.eraseExpiredUnclaimedIdentities(now);

    const cutoff = new Date('2026-07-31T12:00:00.000Z');
    expect(result).toEqual({ anonymized: 1 });
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          source: 'VENDOR_ASSISTED',
          claimedAt: null,
          buyerAccountId: null,
          buyerIdentityErasedAt: null,
          closedAt: { lte: cutoff },
          OR: [{ status: 'CANCELLED' }, { fulfillmentStatus: 'COMPLETED' }],
        }),
        take: 500,
      }),
    );
    expect(prisma.order.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: 'old-order',
          claimedAt: null,
          buyerAccountId: null,
          closedAt: { lte: cutoff },
        }),
      }),
    );
  });

  it('does not count an order twice when a concurrent erasure already won', async () => {
    prisma.order.findMany.mockResolvedValue([
      {
        id: 'already-erased',
        storeId: 'store-1',
        customerId: null,
        customerPhone: '+51987654321',
        customerPhoneNormalized: '+51987654321',
        buyerAccountId: null,
        claimedAt: null,
        status: 'CANCELLED',
        fulfillmentStatus: 'ORDERING',
        accessTokenRevokedAt: null,
      },
    ]);
    prisma.order.updateMany.mockResolvedValue({ count: 0 });

    const result = await useCase.eraseOnBuyerRequest('store-1', '+51987654321', 'operator-1', 'PRIV-460');

    expect(result).toEqual({ anonymized: 0, deferred: 0 });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('is idempotent when the same verified request is submitted twice', async () => {
    prisma.order.findMany
      .mockResolvedValueOnce([
        {
          id: 'order-1',
          storeId: 'store-1',
          customerId: null,
          customerPhone: '+51987654321',
          customerPhoneNormalized: '+51987654321',
          buyerAccountId: null,
          claimedAt: null,
          status: 'CANCELLED',
          fulfillmentStatus: 'ORDERING',
          accessTokenRevokedAt: null,
        },
      ])
      .mockResolvedValueOnce([]);

    const first = await useCase.eraseOnBuyerRequest('store-1', '+51987654321');
    const repeated = await useCase.eraseOnBuyerRequest(
      'store-1',
      '+51987654321',
      'operator-1',
      'PRIV-460',
    );

    expect(first).toEqual({ anonymized: 1, deferred: 0 });
    expect(repeated).toEqual({ anonymized: 0, deferred: 0 });
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it('keeps the shared Customer while another un-erased order still references it', async () => {
    prisma.order.findMany.mockResolvedValue([{
      id: 'closed-assisted-order',
      storeId: 'store-1',
      customerId: 'customer-1',
      customerPhone: '+51987654321',
      customerPhoneNormalized: '+51987654321',
      buyerAccountId: null,
      claimedAt: null,
      status: 'CANCELLED',
      fulfillmentStatus: 'ORDERING',
      accessTokenRevokedAt: null,
    }]);
    prisma.order.count.mockResolvedValue(1);

    const result = await useCase.eraseOnBuyerRequest(
      'store-1',
      '+51987654321',
      'operator-1',
      'PRIV-460',
    );

    expect(result).toEqual({ anonymized: 1, deferred: 0 });
    expect(prisma.customer.updateMany).not.toHaveBeenCalled();
  });
});
