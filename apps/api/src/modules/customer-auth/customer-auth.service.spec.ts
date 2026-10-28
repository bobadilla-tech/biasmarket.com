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
  let events: { record: Mock };
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
    events = { record: vi.fn() };
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
    const emailLookup = {
      email: { equals: identity.email, mode: 'insensitive' },
      emailVerified: true,
    };

    function sessionOf(token: string) {
      return verifyCustomerSessionToken(token, 'test-secret');
    }

    it('signs in the account that already carries the googleSub, without an email lookup', async () => {
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
      expect(prisma.buyerAccount.create).not.toHaveBeenCalled();
      expect(prisma.customerStoreLink.upsert).toHaveBeenCalled();
    });

    it('links the single VERIFIED same-email account by setting googleSub, never overwriting one', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue(null);
      prisma.buyerAccount.findMany.mockResolvedValue([
        { id: 'buyer-1', passwordVersion: 2, name: null, googleSub: null },
      ]);
      prisma.buyerAccount.updateMany.mockResolvedValue({ count: 1 });
      prisma.buyerAccount.findUniqueOrThrow.mockResolvedValue({
        id: 'buyer-1',
        passwordVersion: 2,
      });

      const token = await service.loginWithGoogle('my-store', identity);

      expect(sessionOf(token)).toEqual({
        buyerAccountId: 'buyer-1',
        passwordVersion: 2,
      });
      expect(prisma.buyerAccount.findMany).toHaveBeenCalledWith({
        where: emailLookup,
      });
      expect(prisma.buyerAccount.updateMany).toHaveBeenCalledWith({
        where: { id: 'buyer-1', googleSub: null },
        data: { googleSub: 'google-sub-1', name: 'Buyer Name' },
      });
      expect(prisma.buyerAccount.create).not.toHaveBeenCalled();
    });

    it('keeps an existing name when linking', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue(null);
      prisma.buyerAccount.findMany.mockResolvedValue([
        {
          id: 'buyer-1',
          passwordVersion: 0,
          name: 'Already Set',
          googleSub: null,
        },
      ]);
      prisma.buyerAccount.updateMany.mockResolvedValue({ count: 1 });
      prisma.buyerAccount.findUniqueOrThrow.mockResolvedValue({
        id: 'buyer-1',
        passwordVersion: 0,
      });

      await service.loginWithGoogle('my-store', identity);

      expect(prisma.buyerAccount.updateMany).toHaveBeenCalledWith({
        where: { id: 'buyer-1', googleSub: null },
        data: { googleSub: 'google-sub-1' },
      });
    });

    it('does NOT link or verify an unverified same-email account (pre-hijack); creates a new one', async () => {
      // The DB-level filter excludes unverified rows; model that faithfully:
      // the only same-email row is unverified, so a verified-only query is empty.
      const rows = [
        {
          id: 'attacker',
          passwordVersion: 0,
          name: null,
          googleSub: null,
          emailVerified: false,
        },
      ];
      prisma.buyerAccount.findUnique.mockResolvedValue(null);
      prisma.buyerAccount.findMany.mockImplementation(
        async ({ where }: { where: { emailVerified?: boolean } }) =>
          rows.filter(
            (r) =>
              where.emailVerified === undefined ||
              r.emailVerified === where.emailVerified,
          ),
      );
      prisma.buyerAccount.create.mockResolvedValue({
        id: 'buyer-new',
        passwordVersion: 0,
      });

      const token = await service.loginWithGoogle('my-store', identity);

      expect(sessionOf(token)?.buyerAccountId).toBe('buyer-new');
      expect(prisma.buyerAccount.create).toHaveBeenCalledWith({
        data: {
          email: identity.email,
          emailVerified: true,
          name: 'Buyer Name',
          googleSub: 'google-sub-1',
        },
      });
      const touched = [
        ...prisma.buyerAccount.update.mock.calls,
        ...prisma.buyerAccount.updateMany.mock.calls,
      ];
      expect(touched).toEqual([]);
    });

    it('a googleSub match wins over a later-verified duplicate of the same email', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue({
        id: 'owner',
        passwordVersion: 1,
      });
      prisma.buyerAccount.findMany.mockResolvedValue([
        { id: 'owner', googleSub: 'google-sub-1' },
        { id: 'duplicate', googleSub: null },
      ]);

      const token = await service.loginWithGoogle('my-store', identity);

      expect(sessionOf(token)?.buyerAccountId).toBe('owner');
    });

    it('creates a phone-less account carrying the googleSub when nothing matches', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue(null);
      prisma.buyerAccount.findMany.mockResolvedValue([]);
      prisma.buyerAccount.create.mockResolvedValue({
        id: 'buyer-new',
        passwordVersion: 0,
      });

      const token = await service.loginWithGoogle('my-store', identity);

      expect(prisma.buyerAccount.create).toHaveBeenCalledWith({
        data: {
          email: identity.email,
          emailVerified: true,
          name: 'Buyer Name',
          googleSub: 'google-sub-1',
        },
      });
      expect(sessionOf(token)).toEqual({
        buyerAccountId: 'buyer-new',
        passwordVersion: 0,
      });
      expect(prisma.customerStoreLink.upsert).toHaveBeenCalled();
    });

    it('recovers from a concurrent first login (P2002 on googleSub) by re-reading the winner', async () => {
      prisma.buyerAccount.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'winner', passwordVersion: 0 });
      prisma.buyerAccount.findMany.mockResolvedValue([]);
      prisma.buyerAccount.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      const token = await service.loginWithGoogle('my-store', identity);

      expect(sessionOf(token)?.buyerAccountId).toBe('winner');
    });

    it('does not swallow other create errors', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue(null);
      prisma.buyerAccount.findMany.mockResolvedValue([]);
      prisma.buyerAccount.create.mockRejectedValue(new Error('db down'));

      await expect(
        service.loginWithGoogle('my-store', identity),
      ).rejects.toThrow('db down');
    });

    it('does not link any store for the global entry point', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue(null);
      prisma.buyerAccount.findMany.mockResolvedValue([]);
      prisma.buyerAccount.create.mockResolvedValue({
        id: 'buyer-new',
        passwordVersion: 0,
      });

      await service.loginWithGoogle(null, identity);

      expect(prisma.store.findUnique).not.toHaveBeenCalled();
      expect(prisma.customerStoreLink.upsert).not.toHaveBeenCalled();
    });

    it('refuses an ambiguous email shared by several verified accounts', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue(null);
      prisma.buyerAccount.findMany.mockResolvedValue([
        { id: 'a', passwordVersion: 0, name: null, googleSub: null },
        { id: 'b', passwordVersion: 0, name: null, googleSub: null },
      ]);

      await expect(
        service.loginWithGoogle('my-store', identity),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.buyerAccount.create).not.toHaveBeenCalled();
      expect(prisma.customerStoreLink.upsert).not.toHaveBeenCalled();
    });

    it('signs in a verified same-email account that a concurrent first login already bound to this sub', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue(null);
      prisma.buyerAccount.findMany.mockResolvedValue([
        {
          id: 'buyer-1',
          passwordVersion: 3,
          name: null,
          googleSub: 'google-sub-1',
        },
      ]);

      const token = await service.loginWithGoogle('my-store', identity);

      expect(sessionOf(token)).toEqual({
        buyerAccountId: 'buyer-1',
        passwordVersion: 3,
      });
      expect(prisma.buyerAccount.updateMany).not.toHaveBeenCalled();
      expect(prisma.buyerAccount.create).not.toHaveBeenCalled();
    });

    it('returns the winner when the conditional link update loses a race', async () => {
      prisma.buyerAccount.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'winner', passwordVersion: 0 });
      prisma.buyerAccount.findMany.mockResolvedValue([
        { id: 'buyer-1', passwordVersion: 0, name: null, googleSub: null },
      ]);
      prisma.buyerAccount.updateMany.mockResolvedValue({ count: 0 });

      const token = await service.loginWithGoogle('my-store', identity);

      expect(sessionOf(token)?.buyerAccountId).toBe('winner');
    });

    it('conflicts when the link update loses a race and nobody holds the sub', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue(null);
      prisma.buyerAccount.findMany.mockResolvedValue([
        { id: 'buyer-1', passwordVersion: 0, name: null, googleSub: null },
      ]);
      prisma.buyerAccount.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.loginWithGoogle('my-store', identity),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rethrows a create P2002 when no account holds the sub', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue(null);
      prisma.buyerAccount.findMany.mockResolvedValue([]);
      const p2002 = new Prisma.PrismaClientKnownRequestError('unique', {
        code: 'P2002',
        clientVersion: 'test',
      });
      prisma.buyerAccount.create.mockRejectedValue(p2002);

      await expect(service.loginWithGoogle('my-store', identity)).rejects.toBe(
        p2002,
      );
    });

    it('refuses to link when the only verified account already has a different googleSub', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue(null);
      prisma.buyerAccount.findMany.mockResolvedValue([
        { id: 'a', passwordVersion: 0, name: null, googleSub: 'other-sub' },
      ]);

      await expect(
        service.loginWithGoogle('my-store', identity),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.buyerAccount.updateMany).not.toHaveBeenCalled();
      expect(prisma.buyerAccount.create).not.toHaveBeenCalled();
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

    it('never links an unverified same-email account while claiming', async () => {
      prisma.buyerAccount.findMany.mockImplementation(
        async ({ where }: { where: { emailVerified?: boolean } }) =>
          where.emailVerified === true
            ? []
            : [{ id: 'attacker', googleSub: null, emailVerified: false }],
      );

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
