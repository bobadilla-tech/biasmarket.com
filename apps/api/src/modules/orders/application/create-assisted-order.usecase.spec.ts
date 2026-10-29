import { BadRequestException } from '@nestjs/common';
import { Prisma, type Store } from '@biasmarket/db';
import { hashOrderAccessToken } from '@biasmarket/utils/assisted-order';
import { CreateAssistedOrderUseCase } from './create-assisted-order.usecase.js';
import type { CreateAssistedOrderDto } from '../dto/create-assisted-order.dto.js';
import { DuplicateIdempotencyKeyException } from '../domain/duplicate-idempotency-key.exception.js';
import { upsertAssistedCustomer } from './assisted-customer.js';

vi.mock('./order-creation.core.js', () => ({
  validateDeliveryPreTx: vi.fn().mockResolvedValue({}),
  lockAndValidate: vi.fn().mockResolvedValue({}),
  reserveItems: vi.fn(),
}));
vi.mock('./assisted-customer.js', () => ({
  upsertAssistedCustomer: vi.fn().mockResolvedValue({ id: 'cust1' }),
}));

const core = await import('./order-creation.core.js');

const store = { id: 'store1', slug: 'mi-tienda' } as Store;
const dto = {
  deliveryMethodType: 'PICKUP',
  customerPhone: '987 654 321',
  customerName: ' Sofi ',
  items: [{ productId: 'p', quantity: 1 }],
} as CreateAssistedOrderDto;

function setup(finalAmount: { lte: (n: number) => boolean }) {
  vi.mocked(core.reserveItems).mockResolvedValue({
    orderData: { storeId: 'store1' },
    finalAmount,
  } as never);
  const tx = {
    order: {
      create: vi.fn().mockResolvedValue({ id: 'o1' }),
      findMany: vi.fn().mockResolvedValue([]),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    auditLog: { create: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn((cb: (t: unknown) => unknown) => cb(tx)),
    order: { findFirst: vi.fn().mockResolvedValue(null) },
  };
  const events = { record: vi.fn() };
  const customers = { countPreviousOrders: vi.fn().mockResolvedValue(2) };
  const useCase = new CreateAssistedOrderUseCase(
    prisma as never,
    {} as never,
    events as never,
    customers as never,
  );
  return { useCase, tx, prisma, events };
}

describe('CreateAssistedOrderUseCase', () => {
  beforeEach(() => {
    process.env.WEB_URL = 'https://biasmarket.com';
  });

  it('stores only the token hash and returns the link once', async () => {
    const { useCase, tx, prisma, events } = setup({ lte: () => false });
    const result = await useCase.execute(store, 'user1', dto);

    expect(core.reserveItems).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      store,
      expect.objectContaining({ deliveryMethodType: 'PICKUP' }),
      'ASSISTED_ORDER_V1',
    );

    const token = result.accessUrl.split('/').pop()!;
    const data = tx.order.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      source: 'VENDOR_ASSISTED',
      createdByUserId: 'user1',
      customerPhone: '+51987654321',
      customerPhoneNormalized: '+51987654321',
      customerName: 'Sofi',
      customerId: 'cust1',
      accessTokenHash: hashOrderAccessToken(token),
      accessTokenRevokedAt: null,
    });
    expect(JSON.stringify(data)).not.toContain(token);
    expect(result.previousOrders).toBe(2);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 15_000,
    });
    expect(events.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ type: 'CREATED', actor: 'SELLER' }),
    );
    const audit = JSON.stringify(tx.auditLog.create.mock.calls[0]![0]);
    expect(audit).not.toContain(token);
    expect(audit).not.toContain('Sofi');
    expect(audit).not.toMatch(/\d{8,}/);
  });

  it('rejects a total of 0 so the transaction rolls back', async () => {
    const { useCase, tx } = setup({ lte: () => true });
    await expect(useCase.execute(store, 'user1', dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('maps an invariant failure to a 400', async () => {
    const { useCase } = setup({ lte: () => false });
    await expect(useCase.execute(store, '  ', dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an invalid phone before touching the database', async () => {
    const { useCase, prisma } = setup({ lte: () => false });
    await expect(
      useCase.execute(store, 'user1', { ...dto, customerPhone: 'abc' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  describe('distinct-recipient abuse limit', () => {
    const fiveRecipients = [
      '+51911111111',
      '+51922222222',
      '+51933333333',
      '+51944444444',
      '+51955555555',
    ].map((customerPhoneNormalized) => ({ customerPhoneNormalized }));

    it('rejects a sixth distinct recipient before any order side effects', async () => {
      const { useCase, tx, events } = setup({ lte: () => false });
      tx.order.findMany.mockResolvedValue(fiveRecipients);
      vi.mocked(core.reserveItems).mockClear();
      vi.mocked(upsertAssistedCustomer).mockClear();

      await expect(
        useCase.execute(store, 'seller1', dto),
      ).rejects.toMatchObject({ status: 429 });

      expect(tx.order.findMany).toHaveBeenCalledWith({
        where: {
          source: 'VENDOR_ASSISTED',
          storeId: 'store1',
          createdByUserId: 'seller1',
          createdAt: { gte: expect.any(Date) },
          customerPhoneNormalized: { not: null },
        },
        select: { customerPhoneNormalized: true },
        distinct: ['customerPhoneNormalized'],
      });
      expect(tx.order.create).not.toHaveBeenCalled();
      expect(tx.auditLog.create).not.toHaveBeenCalled();
      expect(events.record).not.toHaveBeenCalled();
      expect(core.reserveItems).not.toHaveBeenCalled();
      expect(upsertAssistedCustomer).not.toHaveBeenCalled();
    });

    it('allows another order for a recipient already seen in the window', async () => {
      const { useCase, tx } = setup({ lte: () => false });
      tx.order.findMany.mockResolvedValue(fiveRecipients);

      await expect(
        useCase.execute(store, 'seller1', {
          ...dto,
          customerPhone: '911 111 111',
        }),
      ).resolves.toMatchObject({ order: { id: 'o1' } });
      expect(tx.order.create).toHaveBeenCalledTimes(1);
    });

    it('uses a rolling ten-minute cutoff and scopes the count to the seller', async () => {
      const now = new Date('2026-10-29T12:00:00.000Z');
      vi.useFakeTimers();
      vi.setSystemTime(now);
      try {
        const { useCase, tx } = setup({ lte: () => false });
        await useCase.execute(store, 'seller2', dto);

        expect(tx.order.findMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              createdByUserId: 'seller2',
              storeId: 'store1',
              createdAt: { gte: new Date(now.getTime() - 10 * 60_000) },
            }),
          }),
        );
        expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('admits a new recipient after the ten-minute window expires', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-10-29T12:00:00.000Z'));
      try {
        const { useCase, tx } = setup({ lte: () => false });
        const createdAt = new Date(Date.now());
        const rows = fiveRecipients.map((recipient) => ({
          ...recipient,
          createdAt,
        }));
        tx.order.findMany.mockImplementation(async (args) =>
          rows
            .filter((row) => row.createdAt >= args.where.createdAt.gte)
            .map(({ customerPhoneNormalized }) => ({
              customerPhoneNormalized,
            })),
        );

        // Before the window expires the database returns five recent
        // recipients. After expiry, none of those rows satisfy the cutoff.
        tx.order.findMany.mockResolvedValueOnce(fiveRecipients);
        await expect(
          useCase.execute(store, 'seller1', dto),
        ).rejects.toMatchObject({ status: 429 });

        vi.advanceTimersByTime(10 * 60_000 + 1);
        await expect(
          useCase.execute(store, 'seller1', dto),
        ).resolves.toMatchObject({ order: { id: 'o1' } });
      } finally {
        vi.useRealTimers();
      }
    });

    it('does not apply one seller’s recipient count to another seller', async () => {
      const { useCase, tx } = setup({ lte: () => false });
      tx.order.findMany.mockImplementation(async (args) =>
        args.where.createdByUserId === 'seller1' ? fiveRecipients : [],
      );

      await expect(
        useCase.execute(store, 'seller1', dto),
      ).rejects.toMatchObject({ status: 429 });
      await expect(
        useCase.execute(store, 'seller2', dto),
      ).resolves.toMatchObject({ order: { id: 'o1' } });
      expect(tx.order.create).toHaveBeenCalledTimes(1);
    });
  });

  // The `@biasmarket/db` alias is a fake in unit specs, so these cover the
  // branches only. The real unique index and the concurrent race are covered
  // by test/assisted-order-idempotency.e2e-spec.ts against a real database.
  describe('idempotency key', () => {
    const KEY = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
    const p2002 = (meta: Record<string, unknown>) =>
      new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
        meta,
      });

    it('changes nothing without a key: no lookup, null column', async () => {
      const { useCase, tx, prisma } = setup({ lte: () => false });
      await useCase.execute(store, 'user1', dto);

      expect(prisma.order.findFirst).not.toHaveBeenCalled();
      expect(tx.order.create.mock.calls[0]![0].data.idempotencyKey).toBeNull();
    });

    it('looks the key up scoped by store AND user, then stores it', async () => {
      const { useCase, tx, prisma } = setup({ lte: () => false });
      await useCase.execute(store, 'user1', dto, KEY);

      expect(prisma.order.findFirst).toHaveBeenCalledWith({
        where: {
          storeId: 'store1',
          createdByUserId: 'user1',
          idempotencyKey: KEY,
        },
        select: { id: true },
      });
      expect(tx.order.create.mock.calls[0]![0].data.idempotencyKey).toBe(KEY);
    });

    it('answers a replay before any stock, delivery or transaction work', async () => {
      const { useCase, prisma, tx } = setup({ lte: () => false });
      prisma.order.findFirst.mockResolvedValue({ id: 'order-first' });
      vi.mocked(core.reserveItems).mockClear();
      vi.mocked(core.validateDeliveryPreTx).mockClear();

      const err = await useCase
        .execute(store, 'user1', dto, KEY)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(DuplicateIdempotencyKeyException);
      expect((err as DuplicateIdempotencyKeyException).orderId).toBe(
        'order-first',
      );
      expect(prisma.$transaction).not.toHaveBeenCalled();
      expect(tx.order.findMany).not.toHaveBeenCalled();
      expect(core.reserveItems).not.toHaveBeenCalled();
      expect(core.validateDeliveryPreTx).not.toHaveBeenCalled();
    });

    it.each([
      [
        'an array target',
        { target: ['storeId', 'createdByUserId', 'idempotencyKey'] },
      ],
      [
        'a constraint-name target',
        { target: 'Order_storeId_createdByUserId_idempotencyKey_key' },
      ],
      [
        'a driver-adapter error',
        {
          driverAdapterError: {
            cause: { constraint: { fields: ['"idempotencyKey"'] } },
          },
        },
      ],
    ])(
      'maps a concurrent unique violation (%s) to the replay, outside the transaction',
      async (_label, meta) => {
        const { useCase, prisma } = setup({ lte: () => false });
        prisma.order.findFirst
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ id: 'order-winner' });
        prisma.$transaction.mockRejectedValue(p2002(meta));

        const err = await useCase
          .execute(store, 'user1', dto, KEY)
          .catch((e: unknown) => e);

        expect(err).toBeInstanceOf(DuplicateIdempotencyKeyException);
        expect((err as DuplicateIdempotencyKeyException).orderId).toBe(
          'order-winner',
        );
        expect(prisma.order.findFirst).toHaveBeenCalledTimes(2);
      },
    );

    it('resolves a stock failure to replay when a same-key winner committed', async () => {
      const { useCase, prisma } = setup({ lte: () => false });
      prisma.order.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'order-winner' });
      const stockFailure = new BadRequestException('Stock insuficiente');
      prisma.$transaction.mockRejectedValue(stockFailure);

      const err = await useCase
        .execute(store, 'user1', dto, KEY)
        .catch((e: unknown) => e);

      expect(err).toBeInstanceOf(DuplicateIdempotencyKeyException);
      expect((err as DuplicateIdempotencyKeyException).orderId).toBe(
        'order-winner',
      );
      expect(prisma.order.findFirst).toHaveBeenCalledTimes(2);
    });

    it('preserves a stock failure when no same-key winner committed', async () => {
      const { useCase, prisma } = setup({ lte: () => false });
      const stockFailure = new BadRequestException('Stock insuficiente');
      prisma.$transaction.mockRejectedValue(stockFailure);

      await expect(useCase.execute(store, 'user1', dto, KEY)).rejects.toBe(
        stockFailure,
      );
      expect(prisma.order.findFirst).toHaveBeenCalledTimes(2);
    });

    it('rethrows a unique violation on another index untouched', async () => {
      const { useCase, prisma } = setup({ lte: () => false });
      const other = p2002({ target: ['accessTokenHash'] });
      prisma.$transaction.mockRejectedValue(other);

      await expect(useCase.execute(store, 'user1', dto, KEY)).rejects.toBe(
        other,
      );
      expect(prisma.order.findFirst).toHaveBeenCalledTimes(1);
    });

    it('rethrows when the winner row cannot be found after the violation', async () => {
      const { useCase, prisma } = setup({ lte: () => false });
      const conflict = p2002({ target: ['idempotencyKey'] });
      prisma.$transaction.mockRejectedValue(conflict);

      await expect(useCase.execute(store, 'user1', dto, KEY)).rejects.toBe(
        conflict,
      );
    });

    it('never treats a violation as a replay when no key was sent', async () => {
      const { useCase, prisma } = setup({ lte: () => false });
      const conflict = p2002({ target: ['idempotencyKey'] });
      prisma.$transaction.mockRejectedValue(conflict);

      await expect(useCase.execute(store, 'user1', dto)).rejects.toBe(conflict);
      expect(prisma.order.findFirst).not.toHaveBeenCalled();
    });
  });
});
