import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { Store } from '@biasmarket/db';
import { ManageAssistedOrderLinkUseCase } from './manage-assisted-order-link.usecase.js';

vi.mock('./assisted-customer.js', () => ({
  upsertAssistedCustomer: vi.fn().mockResolvedValue({ id: 'cust-new' }),
}));

const store = { id: 'store1', slug: 'mi-tienda' } as Store;
const futureDate = () => new Date(Date.now() + 3_600_000);

function makeOrder(overrides: Record<string, unknown> = {}) {
  return {
    source: 'VENDOR_ASSISTED',
    status: 'ACTIVE',
    paymentStatus: 'PENDING_PAYMENT',
    expiresAt: futureDate(),
    linkFirstOpenedAt: null,
    claimedAt: null,
    customerPhone: '+51987000111',
    createdByUserId: 'seller1',
    ...overrides,
  };
}

function setup(order: Record<string, unknown> | null, locked = true) {
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue(locked ? [{ id: 'o1' }] : []),
    order: {
      findFirst: vi.fn().mockResolvedValue(order),
      update: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn((cb: (t: unknown) => unknown) => cb(tx)),
  };
  const events = { record: vi.fn() };
  const useCase = new ManageAssistedOrderLinkUseCase(
    prisma as never,
    events as never,
  );
  return { useCase, tx, events };
}

describe('ManageAssistedOrderLinkUseCase', () => {
  beforeEach(() => {
    process.env.WEB_URL = 'https://biasmarket.com';
  });

  describe('regenerate', () => {
    it('locks and re-reads the order, scopes the write by storeId and stores only the hash', async () => {
      const { useCase, tx, events } = setup(makeOrder());
      const { accessUrl } = await useCase.regenerate(store, 'seller1', 'o1');

      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(tx.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'o1', storeId: 'store1' } }),
      );
      const update = tx.order.update.mock.calls[0]![0];
      expect(update.where).toEqual({ id: 'o1', storeId: 'store1' });
      expect(update.data.accessTokenRevokedAt).toBeNull();
      expect(update.data.accessTokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(update)).not.toContain(accessUrl.split('/').pop()!);
      expect(events.record).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ type: 'LINK_REGENERATED', actor: 'SELLER' }),
      );
      expect(JSON.stringify(tx.auditLog.create.mock.calls)).not.toMatch(
        /\d{8,}/,
      );
    });

    it('treats a hold order expiring exactly now as expired', async () => {
      vi.useFakeTimers();
      try {
        const now = new Date('2026-10-27T12:00:00.000Z');
        vi.setSystemTime(now);
        await expect(
          setup(makeOrder({ expiresAt: new Date(now) })).useCase.regenerate(
            store,
            'seller1',
            'o1',
          ),
        ).rejects.toBeInstanceOf(ConflictException);
        // One millisecond later it is still live.
        await expect(
          setup(
            makeOrder({ expiresAt: new Date(now.getTime() + 1) }),
          ).useCase.regenerate(store, 'seller1', 'o1'),
        ).resolves.toBeDefined();
      } finally {
        vi.useRealTimers();
      }
    });

    it('answers 404 for a missing/foreign order and for a marketplace order', async () => {
      await expect(
        setup(null, false).useCase.regenerate(store, 'seller1', 'o1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        setup(makeOrder({ source: 'MARKETPLACE' })).useCase.regenerate(
          store,
          'seller1',
          'o1',
        ),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each([
      ['cancelled status', { status: 'CANCELLED' }],
      ['cancelled payment', { paymentStatus: 'CANCELLED' }],
      ['hold order past expiry', { expiresAt: new Date(Date.now() - 1) }],
    ])('answers 409 for %s', async (_label, overrides) => {
      const { useCase, tx } = setup(makeOrder(overrides));
      await expect(
        useCase.regenerate(store, 'seller1', 'o1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(tx.order.update).not.toHaveBeenCalled();
    });

    it('allows a VERIFIED order with a past expiresAt', async () => {
      const { useCase, tx } = setup(
        makeOrder({
          paymentStatus: 'VERIFIED',
          expiresAt: new Date(Date.now() - 86_400_000),
        }),
      );
      await useCase.regenerate(store, 'seller1', 'o1');
      expect(tx.order.update).toHaveBeenCalled();
    });
  });

  describe('correctPhone', () => {
    it('rejects an invalid number before opening a transaction', async () => {
      const { useCase } = setup(makeOrder());
      await expect(
        useCase.correctPhone(store, 'seller1', 'o1', 'abc'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('moves the order to the new contact and rotates the token', async () => {
      const { useCase, tx, events } = setup(makeOrder());
      await useCase.correctPhone(store, 'seller1', 'o1', '999 111 222');
      const update = tx.order.update.mock.calls[0]![0];
      expect(update.where).toEqual({ id: 'o1', storeId: 'store1' });
      expect(update.data).toMatchObject({
        customerPhone: '+51999111222',
        customerPhoneNormalized: '+51999111222',
        customerId: 'cust-new',
        accessTokenRevokedAt: null,
      });
      expect(update.data).not.toHaveProperty('customerName');
      expect(events.record).toHaveBeenCalledWith(
        tx,
        expect.objectContaining({ type: 'PHONE_CORRECTED' }),
      );
    });

    it('answers 409 once the buyer opened or claimed the order', async () => {
      for (const overrides of [
        { linkFirstOpenedAt: new Date() },
        { claimedAt: new Date() },
      ]) {
        const { useCase, tx } = setup(makeOrder(overrides));
        await expect(
          useCase.correctPhone(store, 'seller1', 'o1', '999111222'),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(tx.order.update).not.toHaveBeenCalled();
      }
    });

    it('answers 400 for the same number, without echoing it', async () => {
      const { useCase } = setup(makeOrder());
      const error = await useCase
        .correctPhone(store, 'seller1', 'o1', '987000111')
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(BadRequestException);
      expect(
        JSON.stringify((error as BadRequestException).getResponse()),
      ).not.toMatch(/\d{8,}/);
    });
  });

  describe('recordBuyerNotice', () => {
    function setupNotice(order: Record<string, unknown> | null) {
      const prisma = {
        order: {
          findFirst: vi.fn().mockResolvedValue(order),
          update: vi.fn(),
          updateMany: vi.fn(),
        },
      };
      const events = { record: vi.fn() };
      const useCase = new ManageAssistedOrderLinkUseCase(
        prisma as never,
        events as never,
      );
      return { useCase, prisma, events };
    }

    it('scopes the lookup by storeId and logs only the notice type', async () => {
      const { useCase, prisma, events } = setupNotice({
        source: 'VENDOR_ASSISTED',
      });

      await useCase.recordBuyerNotice(store, 'o1', 'ASSISTED_IN_TRANSIT');

      expect(prisma.order.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'o1', storeId: 'store1' } }),
      );
      expect(events.record).toHaveBeenCalledWith(prisma, {
        orderId: 'o1',
        storeId: 'store1',
        type: 'BUYER_NOTIFIED',
        actor: 'SELLER',
        payload: { notice: 'ASSISTED_IN_TRANSIT' },
      });
      // The private link is never rotated or touched by a notice.
      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it('answers 404 for a missing, foreign or marketplace order, logging nothing', async () => {
      for (const order of [null, { source: 'MARKETPLACE' }]) {
        const { useCase, events } = setupNotice(order);
        await expect(
          useCase.recordBuyerNotice(store, 'o1', 'ASSISTED_READY'),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(events.record).not.toHaveBeenCalled();
      }
    });
  });
});
