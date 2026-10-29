import { Test, type TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { type Mock, vi } from 'vitest';
import { Prisma } from '@biasmarket/db';
import { hashPassword } from 'better-auth/crypto';
import {
  createCustomerAccountToken,
  verifyCustomerSessionToken,
} from '@biasmarket/utils/customer-account-token';
import { CustomerAuthService } from './customer-auth.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CustomerAccountService } from '../orders/application/customer-account.service.js';
import { OrderRepository } from '../orders/infrastructure/order.repository.js';
import { OrderEventsService } from '../orders/application/order-events.service.js';
import { ClaimOrderError } from './customer-auth.service.js';

describe('CustomerAuthService', () => {
  let service: CustomerAuthService;
  let prisma: {
    buyerAccount: {
      findUnique: Mock;
      findUniqueOrThrow: Mock;
      findFirst: Mock;
      findMany: Mock;
      create: Mock;
      update: Mock;
      updateMany: Mock;
    };
    customerStoreLink: { upsert: Mock };
    store: { findUnique: Mock };
    order: { findMany: Mock; findFirst: Mock; updateMany: Mock };
    $transaction: Mock;
    $queryRaw: Mock;
  };
  let events: { record: Mock; listForBuyer: Mock };
  let customerAccount: {
    sendPasswordResetEmail: Mock;
    sendEmailChangeConfirmation: Mock;
    sendPhoneChangeConfirmation: Mock;
  };
  let orderRepository: { findRowByIdForStore: Mock };

  const store = { id: 'store-1', slug: 'my-store' };

  beforeEach(async () => {
    process.env.CUSTOMER_ACCOUNT_TOKEN_SECRET = 'test-secret';

    prisma = {
      buyerAccount: {
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      customerStoreLink: { upsert: vi.fn() },
      store: { findUnique: vi.fn().mockResolvedValue(store) },
      order: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
        updateMany: vi.fn(),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'order-1' }]),
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
    };
    events = { record: vi.fn(), listForBuyer: vi.fn().mockResolvedValue([]) };
    customerAccount = {
      sendPasswordResetEmail: vi.fn(),
      sendEmailChangeConfirmation: vi.fn(),
      sendPhoneChangeConfirmation: vi.fn(),
    };
    orderRepository = { findRowByIdForStore: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerAuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: CustomerAccountService, useValue: customerAccount },
        { provide: OrderRepository, useValue: orderRepository },
        { provide: OrderEventsService, useValue: events },
      ],
    }).compile();

    service = module.get(CustomerAuthService);
  });

  describe('register', () => {
    it('sets a password for a verified, not-yet-registered buyer account', async () => {
      const token = createCustomerAccountToken('buyer-1', 'test-secret');
      prisma.buyerAccount.findUnique.mockResolvedValue({
        id: 'buyer-1',
        passwordHash: null,
      });

      const result = await service.register(
        'my-store',
        token,
        'super-secret-1',
      );

      expect(result).toEqual({ ok: true });
      expect(prisma.buyerAccount.update).toHaveBeenCalledWith({
        where: { id: 'buyer-1' },
        data: {
          passwordHash: expect.any(String),
          emailVerified: true,
          passwordVersion: { increment: 1 },
        },
      });
    });

    it('rejects an invalid or expired token', async () => {
      await expect(
        service.register('my-store', 'not-a-token', 'super-secret-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.buyerAccount.update).not.toHaveBeenCalled();
    });

    it("rejects when the token's buyer account no longer exists", async () => {
      const token = createCustomerAccountToken('buyer-1', 'test-secret');
      prisma.buyerAccount.findUnique.mockResolvedValue(null);

      await expect(
        service.register('my-store', token, 'super-secret-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('rejects re-registration once a password is already set (single-use)', async () => {
      const token = createCustomerAccountToken('buyer-1', 'test-secret');
      prisma.buyerAccount.findUnique.mockResolvedValue({
        id: 'buyer-1',
        passwordHash: 'already-set',
      });

      await expect(
        service.register('my-store', token, 'super-secret-1'),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.buyerAccount.update).not.toHaveBeenCalled();
    });

    it('rejects when the store does not exist', async () => {
      prisma.store.findUnique.mockResolvedValue(null);

      await expect(
        service.register('missing-store', 'any-token', 'super-secret-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it("allows a 'reset'-purpose token to overwrite an existing password", async () => {
      const token = createCustomerAccountToken(
        'buyer-1',
        'test-secret',
        'reset',
      );
      prisma.buyerAccount.findUnique.mockResolvedValue({
        id: 'buyer-1',
        passwordHash: 'already-set',
      });

      const result = await service.register(
        'my-store',
        token,
        'brand-new-password-1',
      );

      expect(result).toEqual({ ok: true });
      expect(prisma.buyerAccount.update).toHaveBeenCalledWith({
        where: { id: 'buyer-1' },
        data: {
          passwordHash: expect.any(String),
          passwordVersion: { increment: 1 },
        },
      });
    });

    it("rejects a 'change-email'-purpose token — not a valid purpose for setting a password", async () => {
      const token = createCustomerAccountToken(
        'buyer-1',
        'test-secret',
        'change-email',
      );

      await expect(
        service.register('my-store', token, 'super-secret-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.buyerAccount.update).not.toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('sends a reset email when the phone matches a registered buyer account', async () => {
      const buyerAccount = {
        id: 'buyer-1',
        email: 'jane@example.com',
        passwordHash: 'already-set',
      };
      prisma.buyerAccount.findUnique.mockResolvedValue(buyerAccount);

      await service.forgotPassword('my-store', '+51988888888');

      expect(customerAccount.sendPasswordResetEmail).toHaveBeenCalledWith(
        buyerAccount,
        store,
      );
    });

    it("silently no-ops when the phone doesn't match any account", async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue(null);

      await expect(
        service.forgotPassword('my-store', '+51900000000'),
      ).resolves.toBeUndefined();
      expect(customerAccount.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('silently no-ops when the account never set a password', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue({
        id: 'buyer-1',
        email: 'jane@example.com',
        passwordHash: null,
      });

      await service.forgotPassword('my-store', '+51988888888');

      expect(customerAccount.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('normalizes a differently-formatted but equivalent phone before the lookup', async () => {
      const buyerAccount = {
        id: 'buyer-1',
        email: 'jane@example.com',
        passwordHash: 'already-set',
      };
      prisma.buyerAccount.findUnique.mockResolvedValue(buyerAccount);

      await service.forgotPassword('my-store', '988888888');

      expect(prisma.buyerAccount.findUnique).toHaveBeenCalledWith({
        where: { phone: '+51988888888' },
      });
      expect(customerAccount.sendPasswordResetEmail).toHaveBeenCalledWith(
        buyerAccount,
        store,
      );
    });
  });

  describe('login', () => {
    it('issues a global session token on valid credentials and links the store', async () => {
      const passwordHash = await hashPassword('super-secret-1');
      prisma.buyerAccount.findUnique.mockResolvedValue({
        id: 'buyer-1',
        passwordHash,
        passwordVersion: 3,
      });

      const token = await service.login(
        'my-store',
        '+51988888888',
        'super-secret-1',
      );

      const verified = verifyCustomerSessionToken(token, 'test-secret');
      expect(verified).toEqual({
        buyerAccountId: 'buyer-1',
        passwordVersion: 3,
      });
      expect(prisma.customerStoreLink.upsert).toHaveBeenCalledWith({
        where: {
          buyerAccountId_storeId: {
            buyerAccountId: 'buyer-1',
            storeId: store.id,
          },
        },
        create: { buyerAccountId: 'buyer-1', storeId: store.id },
        update: {},
      });
    });

    it('rejects a wrong password without revealing which part was wrong', async () => {
      const passwordHash = await hashPassword('super-secret-1');
      prisma.buyerAccount.findUnique.mockResolvedValue({
        id: 'buyer-1',
        passwordHash,
        passwordVersion: 0,
      });

      await expect(
        service.login('my-store', '+51988888888', 'wrong-password'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an unknown phone with the same generic error as a wrong password', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue(null);

      await expect(
        service.login('my-store', '+51900000000', 'super-secret-1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an account that has never set a password (magic-link only)', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue({
        id: 'buyer-1',
        passwordHash: null,
        passwordVersion: 0,
      });

      await expect(
        service.login('my-store', '+51988888888', 'anything'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('logs in with a differently-formatted but equivalent phone (no leading +, no dial code)', async () => {
      const passwordHash = await hashPassword('super-secret-1');
      prisma.buyerAccount.findUnique.mockResolvedValue({
        id: 'buyer-1',
        passwordHash,
        passwordVersion: 0,
      });

      await service.login('my-store', '988888888', 'super-secret-1');

      expect(prisma.buyerAccount.findUnique).toHaveBeenCalledWith({
        where: { phone: '+51988888888' },
      });
    });
  });

  describe('loginWithGoogle', () => {
    const identity = {
      sub: 'google-sub-1',
      email: 'Buyer@Example.com',
      name: 'Buyer Name',
    };
    const createData = {
      email: identity.email,
      emailVerified: true,
      name: 'Buyer Name',
      googleSub: 'google-sub-1',
    };

    function sessionOf(token: string) {
      return verifyCustomerSessionToken(token, 'test-secret');
    }

    function logged() {
      return vi
        .spyOn(
          (service as unknown as { logger: { log: (m: unknown) => void } })
            .logger,
          'log',
        )
        .mockImplementation(() => undefined);
    }

    it('signs in the account that already carries the googleSub, with no email lookup and no log', async () => {
      const log = logged();
      prisma.buyerAccount.findUnique.mockResolvedValue({
        id: 'buyer-1',
        passwordVersion: 2,
      });

      const token = await service.loginWithGoogle('my-store', identity);

      expect(sessionOf(token)).toEqual({
        buyerAccountId: 'buyer-1',
        passwordVersion: 2,
      });
      expect(prisma.buyerAccount.findUnique).toHaveBeenCalledWith({
        where: { googleSub: 'google-sub-1' },
      });
      expect(prisma.buyerAccount.findMany).not.toHaveBeenCalled();
      expect(prisma.buyerAccount.findFirst).not.toHaveBeenCalled();
      expect(prisma.buyerAccount.create).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
      expect(prisma.customerStoreLink.upsert).toHaveBeenCalled();
    });

    it('never links a VERIFIED same-email account: creates a new one and leaves the old untouched', async () => {
      const log = logged();
      prisma.buyerAccount.findUnique.mockResolvedValue(null);
      prisma.buyerAccount.create.mockResolvedValue({
        id: 'buyer-new',
        passwordVersion: 0,
      });
      prisma.buyerAccount.findFirst.mockResolvedValue({ id: 'buyer-old' });

      const token = await service.loginWithGoogle('my-store', identity);

      expect(sessionOf(token)?.buyerAccountId).toBe('buyer-new');
      expect(prisma.buyerAccount.create).toHaveBeenCalledWith({
        data: createData,
      });
      expect(prisma.buyerAccount.findMany).not.toHaveBeenCalled();
      expect(prisma.buyerAccount.update).not.toHaveBeenCalled();
      expect(prisma.buyerAccount.updateMany).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledWith({
        event: 'google-link-skipped',
        buyerAccountId: 'buyer-new',
        existingBuyerAccountId: 'buyer-old',
      });
    });

    it('creates a new account for an UNVERIFIED same-email account too (the checkout-created account from #377) and logs ids only', async () => {
      const log = logged();
      prisma.buyerAccount.findUnique.mockResolvedValue(null);
      prisma.buyerAccount.create.mockResolvedValue({
        id: 'buyer-new',
        passwordVersion: 0,
      });
      // The row a checkout created with the victim's email and the
      // attacker's phone, which the victim then confirmed.
      prisma.buyerAccount.findFirst.mockResolvedValue({ id: 'attacker-owned' });

      const token = await service.loginWithGoogle('my-store', identity);

      expect(sessionOf(token)?.buyerAccountId).toBe('buyer-new');
      expect(prisma.buyerAccount.updateMany).not.toHaveBeenCalled();
      expect(prisma.buyerAccount.update).not.toHaveBeenCalled();
      expect(prisma.buyerAccount.findFirst).toHaveBeenCalledWith({
        where: {
          email: { equals: identity.email, mode: 'insensitive' },
          id: { not: 'buyer-new' },
        },
        select: { id: true },
      });
      const logged_ = JSON.stringify(log.mock.calls);
      expect(logged_).not.toContain('example.com');
      expect(logged_).not.toContain('Buyer Name');
    });

    it('does not log when no other account uses the email', async () => {
      const log = logged();
      prisma.buyerAccount.findUnique.mockResolvedValue(null);
      prisma.buyerAccount.create.mockResolvedValue({
        id: 'buyer-new',
        passwordVersion: 0,
      });
      prisma.buyerAccount.findFirst.mockResolvedValue(null);

      await service.loginWithGoogle('my-store', identity);

      expect(prisma.buyerAccount.create).toHaveBeenCalledWith({
        data: createData,
      });
      expect(log).not.toHaveBeenCalled();
      expect(prisma.customerStoreLink.upsert).toHaveBeenCalled();
    });

    it('still signs in when the best-effort skip log lookup fails', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue(null);
      prisma.buyerAccount.create.mockResolvedValue({
        id: 'buyer-new',
        passwordVersion: 0,
      });
      prisma.buyerAccount.findFirst.mockRejectedValue(new Error('db blip'));

      const token = await service.loginWithGoogle('my-store', identity);

      expect(sessionOf(token)?.buyerAccountId).toBe('buyer-new');
    });

    it('recovers from a concurrent first login (P2002 on googleSub) by re-reading the winner, without logging', async () => {
      const log = logged();
      prisma.buyerAccount.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'winner', passwordVersion: 0 });
      prisma.buyerAccount.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      const token = await service.loginWithGoogle('my-store', identity);

      expect(sessionOf(token)?.buyerAccountId).toBe('winner');
      expect(prisma.buyerAccount.findFirst).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
    });

    it('does not swallow other create errors', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue(null);
      prisma.buyerAccount.create.mockRejectedValue(new Error('db down'));

      await expect(
        service.loginWithGoogle('my-store', identity),
      ).rejects.toThrow('db down');
    });

    it('rethrows a create P2002 when no account holds the sub', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue(null);
      const p2002 = new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      });
      prisma.buyerAccount.create.mockRejectedValue(p2002);

      await expect(service.loginWithGoogle('my-store', identity)).rejects.toBe(
        p2002,
      );
    });

    it('does not link any store for the global entry point', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue(null);
      prisma.buyerAccount.create.mockResolvedValue({
        id: 'buyer-new',
        passwordVersion: 0,
      });

      await service.loginWithGoogle(null, identity);

      expect(prisma.store.findUnique).not.toHaveBeenCalled();
      expect(prisma.customerStoreLink.upsert).not.toHaveBeenCalled();
    });
  });

  describe('getGlobalOrderDetail', () => {
    const row = {
      id: 'order-1',
      status: 'ACTIVE',
      paymentStatus: 'VERIFIED',
      fulfillmentStatus: 'IN_TRANSIT',
      totalAmount: new Prisma.Decimal('50.00'),
      requiredAmount: new Prisma.Decimal('50.00'),
      currency: 'PEN',
      createdAt: new Date('2026-10-01T10:00:00.000Z'),
      source: 'VENDOR_ASSISTED',
      claimedAt: new Date('2026-10-02T10:00:00.000Z'),
      trackingNumber: 'OLV-1',
      trackingUrl: 'https://olva.example/1',
      buyerConfirmedReceivedAt: null,
      store: { slug: 'k-store', name: 'K-Store' },
      items: [
        {
          quantity: 2,
          unitPriceAtPurchase: new Prisma.Decimal('25.00'),
          currency: 'PEN',
          product: { name: 'Lightstick' },
        },
      ],
      payments: [
        {
          amount: new Prisma.Decimal('50.00'),
          source: 'SELLER_RECORDED',
          reviewStatus: 'N_A',
          createdAt: new Date('2026-10-01T11:00:00.000Z'),
          voidedAt: null,
          // Present on the row only if a select asked for it; must not leak.
          imageUrl: 'https://private.example/proof.jpg',
          reviewerId: 'seller-1',
          rejectionNote: 'blurry',
          voidReason: 'seller free text',
        },
      ],
    };

    it('filters by id AND buyerAccountId in the query, with an explicit select', async () => {
      prisma.order.findFirst.mockResolvedValue(row);

      await service.getGlobalOrderDetail('buyer-1', 'order-1');

      const arg = prisma.order.findFirst.mock.calls.at(-1)![0];
      expect(arg.where).toEqual({ id: 'order-1', buyerAccountId: 'buyer-1' });
      const selected = JSON.stringify(arg.select);
      for (const forbidden of [
        'imageUrl',
        'reviewerId',
        'rejectionNote',
        'voidReason',
        'voidedBy',
        'accessToken',
        'customerPhone',
        'customerEmail',
        'deliveryDetails',
      ]) {
        expect(selected).not.toContain(forbidden);
      }
    });

    it('answers the same 404 for a missing or foreign order', async () => {
      prisma.order.findFirst.mockResolvedValue(null);
      await expect(
        service.getGlobalOrderDetail('buyer-1', 'someone-elses'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns exactly the documented keys, never proof images or seller text', async () => {
      prisma.order.findFirst.mockResolvedValue(row);
      events.listForBuyer.mockResolvedValue([
        {
          type: 'CLAIMED',
          createdAt: new Date('2026-10-02T10:00:00.000Z'),
          payload: { moment: 'banner' },
        },
        {
          type: 'BUYER_NOTIFIED',
          createdAt: new Date('2026-10-02T11:00:00.000Z'),
          payload: { notice: 'ASSISTED_READY' },
        },
      ]);

      const result = await service.getGlobalOrderDetail('buyer-1', 'order-1');

      expect(Object.keys(result).sort()).toEqual(
        [
          'claimedAt',
          'createdAt',
          'currency',
          'fulfillmentStatus',
          'id',
          'items',
          'paidAmount',
          'paidPercentage',
          'payments',
          'paymentStatus',
          'pendingAmount',
          'receiptConfirmedAt',
          'requiredAmount',
          'source',
          'status',
          'storeName',
          'storeSlug',
          'timeline',
          'totalAmount',
          'trackingNumber',
          'trackingUrl',
        ].sort(),
      );
      expect(Object.keys(result.payments[0]!).sort()).toEqual(
        ['amount', 'createdAt', 'reviewStatus', 'source', 'voidedAt'].sort(),
      );
      expect(result.timeline.map((i) => i.type)).toEqual(['CLAIMED']);
      const json = JSON.stringify(result);
      for (const secret of [
        'proof.jpg',
        'seller-1',
        'blurry',
        'seller free text',
        'ASSISTED_READY',
      ]) {
        expect(json).not.toContain(secret);
      }
      expect(result.claimedAt).toBe('2026-10-02T10:00:00.000Z');
      expect(result.source).toBe('VENDOR_ASSISTED');
    });
  });

  describe('claimWithGoogle', () => {
    const identity = { sub: 'g-sub', email: 'b@example.com', name: 'Buyer' };
    const hash = 'f'.repeat(64);
    const ticket = { orderId: 'order-1', linkFp: 'f'.repeat(16) };
    const approved = {
      amount: 10,
      source: 'SELLER_RECORDED',
      reviewStatus: 'N_A',
      voidedAt: null,
    };
    const order = (patch: Record<string, unknown> = {}) => ({
      id: 'order-1',
      storeId: 'store-1',
      source: 'VENDOR_ASSISTED',
      status: 'ACTIVE',
      paymentStatus: 'VERIFIED',
      claimedAt: null,
      buyerAccountId: null,
      accessTokenHash: hash,
      accessTokenRevokedAt: null,
      payments: [approved],
      ...patch,
    });

    beforeEach(() => {
      // A brand-new Google account by default.
      prisma.buyerAccount.findUnique.mockResolvedValue(null);
      prisma.buyerAccount.findMany.mockResolvedValue([]);
      prisma.buyerAccount.create.mockResolvedValue({
        id: 'buyer-new',
        passwordVersion: 0,
      });
      prisma.order.findFirst.mockResolvedValue(order());
      prisma.order.updateMany.mockResolvedValue({ count: 1 });
    });

    it('creates the account, claims the order once and issues a session', async () => {
      const result = await service.claimWithGoogle(identity, {
        ...ticket,
        moment: 'pago_validado',
      });

      expect(prisma.buyerAccount.create).toHaveBeenCalledWith({
        data: {
          email: identity.email,
          emailVerified: true,
          name: 'Buyer',
          googleSub: 'g-sub',
        },
      });
      expect(prisma.order.updateMany).toHaveBeenCalledWith({
        where: {
          id: 'order-1',
          source: 'VENDOR_ASSISTED',
          status: { not: 'CANCELLED' },
          paymentStatus: { not: 'CANCELLED' },
          claimedAt: null,
          buyerAccountId: null,
          accessTokenRevokedAt: null,
          accessTokenHash: { startsWith: ticket.linkFp },
        },
        data: { buyerAccountId: 'buyer-new', claimedAt: expect.any(Date) },
      });
      expect(prisma.customerStoreLink.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: { buyerAccountId: 'buyer-new', storeId: 'store-1' },
        }),
      );
      expect(events.record).toHaveBeenCalledTimes(1);
      expect(events.record).toHaveBeenCalledWith(prisma, {
        orderId: 'order-1',
        storeId: 'store-1',
        type: 'CLAIMED',
        actor: 'BUYER',
        payload: { moment: 'pago_validado' },
      });
      expect(result.orderId).toBe('order-1');
      expect(verifyCustomerSessionToken(result.token, 'test-secret')).toEqual({
        buyerAccountId: 'buyer-new',
        passwordVersion: 0,
      });
    });

    it('resolves the account outside the transaction (a P2002 must stay recoverable)', async () => {
      await service.claimWithGoogle(identity, ticket);

      const order_ = (fn: Mock) => fn.mock.invocationCallOrder[0]!;
      expect(order_(prisma.buyerAccount.create)).toBeLessThan(
        order_(prisma.$transaction),
      );
    });

    it('uses an existing account found by googleSub', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue({
        id: 'buyer-old',
        passwordVersion: 3,
      });

      const result = await service.claimWithGoogle(identity, ticket);

      expect(prisma.buyerAccount.create).not.toHaveBeenCalled();
      expect(prisma.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { buyerAccountId: 'buyer-old', claimedAt: expect.any(Date) },
        }),
      );
      expect(verifyCustomerSessionToken(result.token, 'test-secret')).toEqual({
        buyerAccountId: 'buyer-old',
        passwordVersion: 3,
      });
    });

    it('never links a same-email account while claiming: the order binds to the Google account', async () => {
      prisma.buyerAccount.findFirst.mockResolvedValue({ id: 'attacker' });

      await service.claimWithGoogle(identity, ticket);

      expect(prisma.buyerAccount.updateMany).not.toHaveBeenCalled();
      expect(prisma.order.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { buyerAccountId: 'buyer-new', claimedAt: expect.any(Date) },
        }),
      );
    });

    it('locks the order row before deciding', async () => {
      await service.claimWithGoogle(identity, ticket);
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(prisma.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.order.findFirst.mock.invocationCallOrder[0]!,
      );
    });

    it.each([
      ['no validated payment', { payments: [] }],
      [
        'only a pending proof',
        {
          payments: [
            {
              ...approved,
              source: 'BUYER_SUBMITTED',
              reviewStatus: 'PENDING_REVIEW',
            },
          ],
        },
      ],
      [
        'only a voided payment',
        { payments: [{ ...approved, voidedAt: new Date() }] },
      ],
      ['a cancelled order', { status: 'CANCELLED' }],
      ['a cancelled payment status', { paymentStatus: 'CANCELLED' }],
      ['a marketplace order', { source: 'MARKETPLACE' }],
    ])('refuses %s as not_claimable, writing nothing', async (_l, patch) => {
      prisma.order.findFirst.mockResolvedValue(order(patch));

      await expect(
        service.claimWithGoogle(identity, ticket),
      ).rejects.toMatchObject({ code: 'not_claimable' });
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
      expect(events.record).not.toHaveBeenCalled();
    });

    it.each([
      ['a revoked link', { accessTokenRevokedAt: new Date() }],
      [
        'a replaced link (regenerate after the ticket was issued)',
        { accessTokenHash: '0'.repeat(64) },
      ],
      ['no link at all', { accessTokenHash: null }],
    ])('refuses %s as invalid', async (_l, patch) => {
      prisma.order.findFirst.mockResolvedValue(order(patch));

      await expect(
        service.claimWithGoogle(identity, ticket),
      ).rejects.toMatchObject({ code: 'invalid' });
      expect(prisma.order.updateMany).not.toHaveBeenCalled();
    });

    it('refuses an order that does not exist', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      await expect(
        service.claimWithGoogle(identity, ticket),
      ).rejects.toMatchObject({ code: 'invalid' });
    });

    it('refuses an order already claimed by someone else, without a second event', async () => {
      prisma.order.findFirst.mockResolvedValue(
        order({ claimedAt: new Date(), buyerAccountId: 'someone-else' }),
      );

      const error = await service
        .claimWithGoogle(identity, ticket)
        .catch((e: unknown) => e);
      expect(error).toBeInstanceOf(ClaimOrderError);
      expect(error).toMatchObject({ code: 'already_claimed' });
      expect(events.record).not.toHaveBeenCalled();
    });

    it('treats a re-claim by the same account as success: session, no new event', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue({
        id: 'buyer-old',
        passwordVersion: 1,
      });
      prisma.order.findFirst.mockResolvedValue(
        order({ claimedAt: new Date(), buyerAccountId: 'buyer-old' }),
      );

      const result = await service.claimWithGoogle(identity, ticket);

      expect(prisma.order.updateMany).not.toHaveBeenCalled();
      expect(events.record).not.toHaveBeenCalled();
      expect(prisma.customerStoreLink.upsert).toHaveBeenCalled();
      expect(verifyCustomerSessionToken(result.token, 'test-secret')).toEqual({
        buyerAccountId: 'buyer-old',
        passwordVersion: 1,
      });
    });

    it('loses a race cleanly: a conditional update that matches nothing is already_claimed', async () => {
      prisma.order.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.claimWithGoogle(identity, ticket),
      ).rejects.toMatchObject({ code: 'already_claimed' });
      expect(events.record).not.toHaveBeenCalled();
      expect(prisma.customerStoreLink.upsert).not.toHaveBeenCalled();
    });

    it('never writes the buyer phone or phoneVerified, and stores no email/phone/token in the event', async () => {
      await service.claimWithGoogle(identity, { ...ticket, moment: 'banner' });

      const json = JSON.stringify([
        prisma.order.updateMany.mock.calls,
        events.record.mock.calls,
      ]);
      expect(json).not.toMatch(
        /phone|b@example\.com|accessToken(?!Revoked|Hash)/i,
      );
      expect(prisma.order.updateMany.mock.calls[0]![0].data).not.toHaveProperty(
        'phoneVerified',
      );
    });
  });

  describe('forgotPasswordGlobal', () => {
    it('sends a store-less reset email when the phone matches a registered buyer', async () => {
      const buyerAccount = {
        id: 'buyer-1',
        email: 'jane@example.com',
        passwordHash: 'already-set',
      };
      prisma.buyerAccount.findUnique.mockResolvedValue(buyerAccount);

      await service.forgotPasswordGlobal('+51988888888');

      expect(customerAccount.sendPasswordResetEmail).toHaveBeenCalledWith(
        buyerAccount,
        null,
      );
      expect(prisma.store.findUnique).not.toHaveBeenCalled();
    });

    it.each([
      ['an unknown phone', null],
      [
        'an account that never set a password',
        { id: 'b', email: 'a@b.c', passwordHash: null },
      ],
      [
        'an account without an email',
        { id: 'b', email: null, passwordHash: 'x' },
      ],
    ])('silently no-ops for %s', async (_label, account) => {
      prisma.buyerAccount.findUnique.mockResolvedValue(account);

      await expect(
        service.forgotPasswordGlobal('+51900000000'),
      ).resolves.toBeUndefined();
      expect(customerAccount.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('resetPasswordGlobal', () => {
    it('redeems a reset token without needing a store', async () => {
      const token = createCustomerAccountToken(
        'buyer-1',
        'test-secret',
        'reset',
      );
      prisma.buyerAccount.findUnique.mockResolvedValue({
        id: 'buyer-1',
        passwordHash: 'old',
      });

      await expect(
        service.resetPasswordGlobal(token, 'super-secret-1'),
      ).resolves.toEqual({ ok: true });

      expect(prisma.store.findUnique).not.toHaveBeenCalled();
      expect(prisma.buyerAccount.update).toHaveBeenCalledWith({
        where: { id: 'buyer-1' },
        data: {
          passwordHash: expect.any(String),
          passwordVersion: { increment: 1 },
        },
      });
    });

    it('rejects an invalid or expired token', async () => {
      await expect(
        service.resetPasswordGlobal('not-a-token', 'super-secret-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.buyerAccount.update).not.toHaveBeenCalled();
    });
  });

  describe('loginGlobal', () => {
    it('issues a session token without linking any store', async () => {
      const passwordHash = await hashPassword('super-secret-1');
      prisma.buyerAccount.findUnique.mockResolvedValue({
        id: 'buyer-1',
        passwordHash,
        passwordVersion: 1,
      });

      const token = await service.loginGlobal('+51988888888', 'super-secret-1');

      expect(verifyCustomerSessionToken(token, 'test-secret')).toEqual({
        buyerAccountId: 'buyer-1',
        passwordVersion: 1,
      });
      expect(prisma.customerStoreLink.upsert).not.toHaveBeenCalled();
    });

    it('rejects a wrong password with the generic error', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue({
        id: 'buyer-1',
        passwordHash: await hashPassword('super-secret-1'),
        passwordVersion: 1,
      });

      await expect(
        service.loginGlobal('+51988888888', 'nope-nope-1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('changePassword', () => {
    it('rotates the password, bumps the password version, and issues a fresh session token', async () => {
      const currentHash = await hashPassword('old-password-1');
      prisma.buyerAccount.findUnique.mockResolvedValue({
        id: 'buyer-1',
        passwordHash: currentHash,
        passwordVersion: 1,
      });
      prisma.buyerAccount.update.mockResolvedValue({
        id: 'buyer-1',
        passwordVersion: 2,
      });

      const token = await service.changePassword(
        'buyer-1',
        'old-password-1',
        'new-password-1',
      );

      expect(prisma.buyerAccount.update).toHaveBeenCalledWith({
        where: { id: 'buyer-1' },
        data: {
          passwordHash: expect.any(String),
          passwordVersion: { increment: 1 },
        },
      });
      const verified = verifyCustomerSessionToken(token, 'test-secret');
      expect(verified).toEqual({
        buyerAccountId: 'buyer-1',
        passwordVersion: 2,
      });
    });

    it('rejects the wrong current password', async () => {
      const currentHash = await hashPassword('old-password-1');
      prisma.buyerAccount.findUnique.mockResolvedValue({
        id: 'buyer-1',
        passwordHash: currentHash,
        passwordVersion: 1,
      });

      await expect(
        service.changePassword(
          'buyer-1',
          'not-the-current-one',
          'new-password-1',
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.buyerAccount.update).not.toHaveBeenCalled();
    });

    it('rejects an account without a password set', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue({
        id: 'buyer-1',
        passwordHash: null,
        passwordVersion: 0,
      });

      await expect(
        service.changePassword('buyer-1', 'anything', 'new-password-1'),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('getProfile', () => {
    const session = { buyerAccountId: 'buyer-1' };

    it('returns the buyer account plus their order history, scoped to this store', async () => {
      prisma.buyerAccount.findUniqueOrThrow.mockResolvedValue({
        id: 'buyer-1',
        name: 'Jane',
        email: 'jane@example.com',
        phone: '+51988888888',
        emailVerified: true,
      });
      const orders = [
        {
          id: 'order-1',
          paymentStatus: 'VERIFIED',
          fulfillmentStatus: 'READY',
          totalAmount: new Prisma.Decimal('100.00'),
          requiredAmount: new Prisma.Decimal('100.00'),
          currency: 'PEN',
          createdAt: new Date('2026-01-01'),
          payments: [
            {
              amount: new Prisma.Decimal('100.00'),
              source: 'SELLER_RECORDED',
              reviewStatus: 'N_A',
            },
          ],
        },
      ];
      prisma.order.findMany.mockResolvedValue(orders);

      const result = await service.getProfile('my-store', session);

      expect(result.customer).toEqual({
        name: 'Jane',
        email: 'jane@example.com',
        phone: '+51988888888',
        emailVerified: true,
      });
      expect(result.orders).toHaveLength(1);
      expect(result.orders[0]).toEqual(
        expect.objectContaining({
          id: 'order-1',
          paidAmount: 100,
          pendingAmount: 0,
          paidPercentage: 100,
        }),
      );
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { buyerAccountId: 'buyer-1', storeId: store.id },
        }),
      );
    });

    it('rejects when the store does not exist', async () => {
      prisma.store.findUnique.mockResolvedValue(null);

      await expect(
        service.getProfile('missing-store', session),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('getOrderDetail', () => {
    const session = { buyerAccountId: 'buyer-1' };

    it('returns the order row when it belongs to this buyer', async () => {
      const row = { id: 'order-1', buyerAccountId: 'buyer-1' };
      orderRepository.findRowByIdForStore.mockResolvedValue(row);

      const result = await service.getOrderDetail(
        'my-store',
        session,
        'order-1',
      );

      expect(orderRepository.findRowByIdForStore).toHaveBeenCalledWith(
        'order-1',
        store.id,
      );
      expect(result).toBe(row);
    });

    it('404s when the order belongs to a different buyer', async () => {
      orderRepository.findRowByIdForStore.mockResolvedValue({
        id: 'order-1',
        buyerAccountId: 'someone-else',
      });

      await expect(
        service.getOrderDetail('my-store', session, 'order-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('propagates a 404 for a nonexistent order or wrong store', async () => {
      orderRepository.findRowByIdForStore.mockRejectedValue(
        new NotFoundException('Orden no encontrada'),
      );

      await expect(
        service.getOrderDetail('my-store', session, 'missing-order'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('updateProfile', () => {
    const session = { buyerAccountId: 'buyer-1' };
    const currentBuyerAccount = {
      id: 'buyer-1',
      name: 'Old Name',
      email: 'old@example.com',
      phone: '+51988888888',
      emailVerified: true,
    };

    beforeEach(() => {
      prisma.buyerAccount.findUniqueOrThrow.mockResolvedValue(
        currentBuyerAccount,
      );
    });

    it('updates the name only', async () => {
      prisma.buyerAccount.update.mockResolvedValue({
        ...currentBuyerAccount,
        name: 'New Name',
      });

      const result = await service.updateProfile('my-store', session, {
        name: 'New Name',
      });

      expect(prisma.buyerAccount.update).toHaveBeenCalledWith({
        where: { id: 'buyer-1' },
        data: { name: 'New Name' },
      });
      expect(result).toEqual({
        name: 'New Name',
        pendingEmail: undefined,
        pendingPhone: undefined,
      });
    });

    it('stages a new email and sends a confirmation to the new address', async () => {
      prisma.buyerAccount.findFirst.mockResolvedValue(null);
      prisma.buyerAccount.update.mockResolvedValue({
        ...currentBuyerAccount,
        pendingEmail: 'new@example.com',
      });

      await service.updateProfile('my-store', session, {
        name: 'Old Name',
        email: 'new@example.com',
      });

      expect(prisma.buyerAccount.update).toHaveBeenCalledWith({
        where: { id: 'buyer-1' },
        data: { name: 'Old Name', pendingEmail: 'new@example.com' },
      });
      expect(customerAccount.sendEmailChangeConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({ pendingEmail: 'new@example.com' }),
        store,
        'new@example.com',
      );
    });

    it('rejects an email already used by another buyer account, globally', async () => {
      prisma.buyerAccount.findFirst.mockResolvedValue({ id: 'other-buyer' });

      await expect(
        service.updateProfile('my-store', session, {
          name: 'Old Name',
          email: 'taken@example.com',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.buyerAccount.update).not.toHaveBeenCalled();
      expect(prisma.buyerAccount.findFirst).toHaveBeenCalledWith({
        where: { email: 'taken@example.com', NOT: { id: 'buyer-1' } },
      });
    });

    it('stages a new phone and sends a confirmation to the current verified email', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue(null);
      prisma.buyerAccount.update.mockResolvedValue({
        ...currentBuyerAccount,
        pendingPhone: '+51900000001',
      });

      await service.updateProfile('my-store', session, {
        name: 'Old Name',
        phone: '+51900000001',
      });

      expect(prisma.buyerAccount.update).toHaveBeenCalledWith({
        where: { id: 'buyer-1' },
        data: { name: 'Old Name', pendingPhone: '+51900000001' },
      });
      expect(customerAccount.sendPhoneChangeConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({ pendingPhone: '+51900000001' }),
        store,
      );
    });

    it("rejects a phone change when the current email isn't verified yet", async () => {
      prisma.buyerAccount.findUniqueOrThrow.mockResolvedValue({
        ...currentBuyerAccount,
        emailVerified: false,
      });

      await expect(
        service.updateProfile('my-store', session, {
          name: 'Old Name',
          phone: '+51900000001',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.buyerAccount.update).not.toHaveBeenCalled();
    });

    it('rejects a phone already used by another buyer account, globally', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue({ id: 'other-buyer' });

      await expect(
        service.updateProfile('my-store', session, {
          name: 'Old Name',
          phone: '+51900000001',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.buyerAccount.update).not.toHaveBeenCalled();
    });

    it('normalizes a differently-formatted phone before the duplicate check and the write', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue(null);
      prisma.buyerAccount.update.mockResolvedValue({
        ...currentBuyerAccount,
        pendingPhone: '+51900000001',
      });

      await service.updateProfile('my-store', session, {
        name: 'Old Name',
        phone: '900000001',
      });

      expect(prisma.buyerAccount.findUnique).toHaveBeenCalledWith({
        where: { phone: '+51900000001' },
      });
      expect(prisma.buyerAccount.update).toHaveBeenCalledWith({
        where: { id: 'buyer-1' },
        data: { name: 'Old Name', pendingPhone: '+51900000001' },
      });
    });
  });

  describe('getGlobalProfile', () => {
    it('returns the buyer account profile plus every linked store', async () => {
      prisma.buyerAccount.findUniqueOrThrow.mockResolvedValue({
        id: 'buyer-1',
        name: 'Jane',
        email: 'jane@example.com',
        phone: '+51988888888',
        emailVerified: true,
        pendingEmail: null,
        pendingPhone: null,
        stores: [
          { store: { slug: 'store-a', name: 'Store A' } },
          { store: { slug: 'store-b', name: 'Store B' } },
        ],
      });

      const result = await service.getGlobalProfile('buyer-1');

      expect(result.stores).toEqual([
        { slug: 'store-a', name: 'Store A' },
        { slug: 'store-b', name: 'Store B' },
      ]);
    });
  });

  describe('getGlobalOrders', () => {
    it('returns orders across every store, unscoped by CustomerStoreLink', async () => {
      prisma.order.findMany.mockResolvedValue([
        {
          id: 'order-1',
          paymentStatus: 'VERIFIED',
          fulfillmentStatus: 'READY',
          totalAmount: new Prisma.Decimal('100.00'),
          requiredAmount: new Prisma.Decimal('100.00'),
          currency: 'PEN',
          createdAt: new Date('2026-01-01'),
          store: { slug: 'store-a', name: 'Store A' },
          payments: [],
        },
      ]);

      const result = await service.getGlobalOrders('buyer-1');

      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { buyerAccountId: 'buyer-1' } }),
      );
      expect(result).toEqual([
        expect.objectContaining({
          id: 'order-1',
          storeSlug: 'store-a',
          paidAmount: 0,
          pendingAmount: 100,
          paidPercentage: 0,
        }),
      ]);
    });
  });
});
