import { type Mock, vi } from 'vitest';
import { Prisma } from '@biasmarket/db';
import { OrderRepository } from './order.repository.js';

describe('OrderRepository.findRelatedForStore', () => {
  let repo: OrderRepository;
  let prisma: { order: { findMany: Mock; count: Mock } };

  const current = {
    id: 'cur-order-0001',
    customerPhone: '987 654 321',
    customerPhoneNormalized: '+51987654321',
  };
  const row = (id: string, createdAt: string, extra: object = {}) => ({
    id,
    createdAt: new Date(createdAt),
    status: 'ACTIVE',
    paymentStatus: 'PENDING_PAYMENT',
    fulfillmentStatus: 'ORDERING',
    totalAmount: new Prisma.Decimal('50.00'),
    currency: 'PEN',
    source: 'VENDOR_ASSISTED',
    ...extra,
  });

  beforeEach(() => {
    prisma = {
      order: { findMany: vi.fn(), count: vi.fn().mockResolvedValue(0) },
    };
    prisma.order.findMany.mockResolvedValue([]);
    repo = new OrderRepository(prisma as never);
  });

  it('scopes the indexed, count and legacy queries by storeId and excludes the current order', async () => {
    await repo.findRelatedForStore('store-1', current);

    const indexedWhere = prisma.order.findMany.mock.calls[0][0].where;
    expect(indexedWhere).toEqual({
      storeId: 'store-1',
      customerPhoneNormalized: '+51987654321',
      id: { not: 'cur-order-0001' },
    });
    expect(prisma.order.count.mock.calls[0][0].where).toEqual(indexedWhere);
    expect(prisma.order.findMany.mock.calls[0][0]).toMatchObject({
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const legacy = prisma.order.findMany.mock.calls[1][0];
    expect(legacy.where).toEqual({
      storeId: 'store-1',
      customerPhoneNormalized: null,
      id: { not: 'cur-order-0001' },
    });
    expect(legacy.take).toBe(500);
  });

  it('normalises the current order phone when it is a legacy row', async () => {
    await repo.findRelatedForStore('store-1', {
      ...current,
      customerPhoneNormalized: null,
    });
    expect(
      prisma.order.findMany.mock.calls[0][0].where.customerPhoneNormalized,
    ).toBe('+51987654321');
  });

  it('returns only allow-listed fields', async () => {
    prisma.order.findMany.mockResolvedValueOnce([
      row('other-order-AB1234', '2026-09-01T00:00:00.000Z', {
        customerPhone: '+51987654321',
        customerName: 'Secret',
        accessTokenHash: 'hash',
      }),
    ]);
    prisma.order.count.mockResolvedValue(1);

    const result = await repo.findRelatedForStore('store-1', current);

    expect(result).toEqual({
      items: [
        {
          id: 'other-order-AB1234',
          orderNumber: 'AB1234',
          createdAt: '2026-09-01T00:00:00.000Z',
          status: 'ACTIVE',
          paymentStatus: 'PENDING_PAYMENT',
          fulfillmentStatus: 'ORDERING',
          totalAmount: '50',
          currency: 'PEN',
          source: 'VENDOR_ASSISTED',
        },
      ],
      total: 1,
    });
    const text = JSON.stringify(result);
    expect(text).not.toContain('Secret');
    expect(text).not.toContain('hash');
    expect(text).not.toContain('987654321');
  });

  it('merges legacy rows with the same phone, newest first, capped at 10, and counts them', async () => {
    prisma.order.findMany
      .mockResolvedValueOnce([
        row('indexed-1', '2026-09-03T00:00:00.000Z'),
        row('indexed-2', '2026-09-01T00:00:00.000Z'),
      ])
      .mockResolvedValueOnce([
        row('legacy-match', '2026-09-02T00:00:00.000Z', {
          customerPhone: '987654321',
        }),
        row('legacy-other', '2026-09-04T00:00:00.000Z', {
          customerPhone: '999111222',
        }),
      ]);
    prisma.order.count.mockResolvedValue(12);

    const result = await repo.findRelatedForStore('store-1', current);

    expect(result.items.map((i) => i.id)).toEqual([
      'indexed-1',
      'legacy-match',
      'indexed-2',
    ]);
    expect(result.total).toBe(13);
  });

  it('keeps at most 10 items', async () => {
    prisma.order.findMany.mockResolvedValueOnce(
      Array.from({ length: 10 }, (_, i) =>
        row(`indexed-${i}`, `2026-09-${String(10 + i)}T00:00:00.000Z`),
      ),
    );
    prisma.order.findMany.mockResolvedValueOnce([
      row('legacy-new', '2026-10-01T00:00:00.000Z', {
        customerPhone: '987654321',
      }),
    ]);
    prisma.order.count.mockResolvedValue(10);

    const result = await repo.findRelatedForStore('store-1', current);

    expect(result.items).toHaveLength(10);
    expect(result.items[0]!.id).toBe('legacy-new');
    expect(result.total).toBe(11);
  });
  it('does not match blank erased phone values to a legacy current order', async () => {
    prisma.order.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        row('erased-order', '2026-09-02T00:00:00.000Z', { customerPhone: '' }),
      ]);
    prisma.order.count.mockResolvedValue(0);

    const result = await repo.findRelatedForStore('store-1', {
      id: 'current-erased-order',
      customerPhone: '',
      customerPhoneNormalized: null,
    });

    expect(result).toEqual({ items: [], total: 0 });
  });
});
