import { Test, type TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { type Mock, vi } from 'vitest';
import { Prisma } from '@biasmarket/db';
import { CustomerAccountService } from './customer-account.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { MailerService } from '../../../mailer/mailer.service.js';
import { createCustomerAccountToken } from '@biasmarket/utils/customer-account-token';

describe('CustomerAccountService', () => {
  let service: CustomerAccountService;
  let prisma: {
    customer: { findUnique: Mock; update: Mock };
    buyerAccount: {
      findUnique: Mock;
      findUniqueOrThrow: Mock;
      findFirst: Mock;
      update: Mock;
      updateMany: Mock;
    };
    order: { findMany: Mock };
    store: { findUnique: Mock };
    $executeRaw: Mock;
    $transaction: Mock;
  };
  let mailer: { send: Mock };

  const store = { id: 'store-1', slug: 'my-store', name: 'My Store' };

  beforeEach(async () => {
    process.env.CUSTOMER_ACCOUNT_TOKEN_SECRET = 'test-secret';
    process.env.WEB_URL = 'https://web.example.com';

    prisma = {
      customer: { findUnique: vi.fn(), update: vi.fn() },
      buyerAccount: {
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        findFirst: vi.fn().mockResolvedValue(null),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      order: { findMany: vi.fn() },
      store: { findUnique: vi.fn().mockResolvedValue(store) },
      $executeRaw: vi.fn().mockResolvedValue(1),
      $transaction: vi.fn(),
    };
    prisma.$transaction.mockImplementation(
      async (fn: (tx: unknown) => unknown) => fn(prisma),
    );
    mailer = { send: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerAccountService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailerService, useValue: mailer },
      ],
    }).compile();

    service = module.get(CustomerAccountService);
  });

  describe('findOrCreateCustomer', () => {
    const PHONE = '+51988888888';
    const winner = {
      id: 'buyer-1',
      phone: PHONE,
      email: 'jane@example.com',
      emailVerified: false,
    };

    // Tagged-template calls arrive as (strings, ...values).
    const statements = () =>
      prisma.$executeRaw.mock.calls.map((call: unknown[]) => {
        const [strings, ...values] = call as [
          TemplateStringsArray,
          ...unknown[],
        ];
        return {
          sql: strings.join('?').replace(/\s+/g, ' ').trim(),
          values,
        };
      });
    const insertInto = (table: string) =>
      statements().filter((s) => s.sql.includes(`INSERT INTO "${table}"`));

    const checkout = (
      email = 'jane@example.com',
      session?: { buyerAccountId: string; passwordVersion: number },
      rawPhone = PHONE,
    ) =>
      service.findOrCreateCustomer(
        prisma as never,
        store.id,
        rawPhone,
        email,
        'Jane',
        session,
      );

    beforeEach(() => {
      // A customer row exists after the ON CONFLICT insert.
      prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1' });
      prisma.customer.update.mockImplementation(
        async ({ data }: { data: object }) => ({
          id: 'customer-1',
          ...data,
        }),
      );
    });

    it('takes the per-phone advisory lock before the first BuyerAccount read', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue({
        ...winner,
        emailVerified: true,
      });

      await checkout();

      const [first] = statements();
      expect(first.sql).toContain('pg_advisory_xact_lock');
      expect(first.values).toEqual([`buyer-phone:${PHONE}`]);
      expect(prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.buyerAccount.findUnique.mock.invocationCallOrder[0],
      );
    });

    it('creates the BuyerAccount, link and Customer with ON CONFLICT inserts and explicit ids', async () => {
      prisma.buyerAccount.findUnique
        .mockResolvedValueOnce(null) // no account has this phone yet
        .mockResolvedValueOnce(winner); // re-read after the insert
      prisma.buyerAccount.update.mockResolvedValue(winner);

      const result = await checkout();

      const [account] = insertInto('BuyerAccount');
      expect(account.sql).toContain('ON CONFLICT ("phone") DO NOTHING');
      expect(account.values).toEqual([
        expect.any(String), // id
        PHONE,
        'jane@example.com',
        'Jane',
      ]);
      const [link] = insertInto('CustomerStoreLink');
      expect(link.sql).toContain('ON CONFLICT ("buyerAccountId", "storeId")');
      expect(link.values).toEqual([expect.any(String), 'buyer-1', store.id]);
      const [customer] = insertInto('Customer');
      expect(customer.sql).toContain('ON CONFLICT ("storeId", "phone")');
      expect(customer.values).toEqual([expect.any(String), store.id, PHONE]);
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'customer-1', storeId: store.id },
        data: { email: 'jane@example.com', name: 'Jane', emailVerified: false },
      });
      expect(result.buyerAccount).toEqual(winner);
      expect(result.needsVerificationEmail).toBe(true);
    });

    it('scopes every link and Customer statement by storeId', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue({
        ...winner,
        emailVerified: true,
      });

      await checkout();

      for (const s of [
        ...insertInto('CustomerStoreLink'),
        ...insertInto('Customer'),
      ]) {
        expect(s.sql).toContain('"storeId"');
        expect(s.values).toContain(store.id);
      }
    });

    it('normalizes a differently-formatted phone before every lookup and write', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue({
        ...winner,
        emailVerified: true,
      });

      await checkout('jane@example.com', undefined, '988888888');

      expect(prisma.buyerAccount.findUnique).toHaveBeenCalledWith({
        where: { phone: PHONE },
      });
      expect(statements()[0].values).toEqual([`buyer-phone:${PHONE}`]);
      expect(prisma.customer.findUnique).toHaveBeenCalledWith({
        where: { storeId_phone: { storeId: store.id, phone: PHONE } },
        select: { id: true },
      });
    });

    it('reuses an existing verified BuyerAccount as-is, but still ensures link and Customer', async () => {
      const verified = { ...winner, emailVerified: true };
      prisma.buyerAccount.findUnique.mockResolvedValue(verified);

      const result = await checkout();

      expect(insertInto('BuyerAccount')).toHaveLength(0);
      expect(prisma.buyerAccount.update).not.toHaveBeenCalled();
      expect(insertInto('CustomerStoreLink')).toHaveLength(1);
      expect(result.buyerAccount).toEqual(verified);
      expect(result.customer).toMatchObject({
        id: 'customer-1',
        emailVerified: true,
      });
      expect(result.needsVerificationEmail).toBe(false);
    });

    it('re-sends verification when the same unverified email checks out again', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue(winner);
      prisma.buyerAccount.update.mockResolvedValue(winner);

      const result = await checkout();

      expect(prisma.buyerAccount.update).toHaveBeenCalledWith({
        where: { id: 'buyer-1' },
        data: { email: 'jane@example.com', emailVerified: false },
      });
      expect(result.needsVerificationEmail).toBe(true);
    });

    it.each([
      ['verified', true],
      ['unverified', false],
    ])(
      'places a guest order and touches nothing when a different email is submitted for a %s account',
      async (_label, emailVerified) => {
        prisma.buyerAccount.findUnique.mockResolvedValue({
          ...winner,
          emailVerified,
        });

        const result = await checkout('attacker@example.com');

        expect(prisma.buyerAccount.update).not.toHaveBeenCalled();
        expect(prisma.customer.update).not.toHaveBeenCalled();
        // only the advisory lock ran
        expect(statements()).toHaveLength(1);
        expect(result).toEqual({
          customer: null,
          buyerAccount: null,
          needsVerificationEmail: false,
        });
      },
    );

    describe('after losing the insert race', () => {
      it('adopts the winner when the email matches', async () => {
        prisma.buyerAccount.findUnique
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(winner);
        prisma.buyerAccount.update.mockResolvedValue(winner);

        const result = await checkout();

        expect(result.buyerAccount?.id).toBe('buyer-1');
        expect(result.needsVerificationEmail).toBe(true);
        expect(insertInto('CustomerStoreLink')).toHaveLength(1);
      });

      it('returns the guest result, with no account data, when the winner has another email', async () => {
        prisma.buyerAccount.findUnique
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ ...winner, email: 'winner@example.com' });

        const result = await checkout('loser@example.com');

        expect(prisma.buyerAccount.update).not.toHaveBeenCalled();
        expect(insertInto('CustomerStoreLink')).toHaveLength(0);
        expect(insertInto('Customer')).toHaveLength(0);
        expect(result).toEqual({
          customer: null,
          buyerAccount: null,
          needsVerificationEmail: false,
        });
      });

      it('throws a ConflictException when the insert produced nothing and the re-read is empty', async () => {
        prisma.buyerAccount.findUnique.mockResolvedValue(null);

        await expect(checkout()).rejects.toThrow(ConflictException);
        expect(insertInto('CustomerStoreLink')).toHaveLength(0);
      });
    });

    it('throws a ConflictException when the Customer row cannot be found after its insert', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue({
        ...winner,
        emailVerified: true,
      });
      prisma.customer.findUnique.mockResolvedValue(null);

      await expect(checkout()).rejects.toThrow(ConflictException);
      expect(insertInto('Customer')).toHaveLength(2); // one retry
    });

    describe('phone-less (Google) accounts', () => {
      const session = { buyerAccountId: 'buyer-g', passwordVersion: 0 };
      const googleAccount = {
        id: 'buyer-g',
        phone: null,
        email: 'jane@example.com',
        name: 'Jane',
        passwordVersion: 0,
        emailVerified: true,
      };

      it('attaches the phone to the signed-in buyer who owns the email, guarded on its own row', async () => {
        prisma.buyerAccount.findUnique
          .mockResolvedValueOnce(null) // no account has this phone yet
          .mockResolvedValueOnce(googleAccount); // the session's own account
        prisma.buyerAccount.updateMany.mockResolvedValue({ count: 1 });
        prisma.buyerAccount.findUniqueOrThrow.mockResolvedValue({
          ...googleAccount,
          phone: PHONE,
        });

        const result = await checkout('Jane@Example.com', session);

        expect(prisma.buyerAccount.updateMany).toHaveBeenCalledWith({
          where: { id: 'buyer-g', phone: null },
          data: { phone: PHONE, name: 'Jane' },
        });
        expect(insertInto('BuyerAccount')).toHaveLength(0);
        expect(prisma.buyerAccount.update).not.toHaveBeenCalled();
        expect(result.buyerAccount?.id).toBe('buyer-g');
        expect(result.needsVerificationEmail).toBe(false);
      });

      it('returns the guest result, and never mints a second account, when the attach was lost', async () => {
        prisma.buyerAccount.findUnique
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(googleAccount);
        prisma.buyerAccount.updateMany.mockResolvedValue({ count: 0 });

        const result = await checkout('jane@example.com', session);

        expect(insertInto('BuyerAccount')).toHaveLength(0);
        expect(insertInto('CustomerStoreLink')).toHaveLength(0);
        expect(result).toEqual({
          customer: null,
          buyerAccount: null,
          needsVerificationEmail: false,
        });
      });

      it('does not attach the phone when the session password version is stale', async () => {
        prisma.buyerAccount.findUnique
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({ ...googleAccount, passwordVersion: 5 });
        prisma.buyerAccount.findFirst.mockResolvedValue(googleAccount);

        const result = await checkout('jane@example.com', session);

        expect(prisma.buyerAccount.updateMany).not.toHaveBeenCalled();
        expect(result.buyerAccount).toBeNull();
      });

      it('falls back to a guest order instead of duplicating an unauthenticated phone-less email owner', async () => {
        prisma.buyerAccount.findUnique.mockResolvedValue(null);
        prisma.buyerAccount.findFirst.mockResolvedValue(googleAccount);

        const result = await checkout();

        expect(insertInto('BuyerAccount')).toHaveLength(0);
        expect(result).toEqual({
          customer: null,
          buyerAccount: null,
          needsVerificationEmail: false,
        });
      });
    });
  });

  describe('sendVerificationEmail', () => {
    it('sends an email with a confirm link and never throws on mailer failure', async () => {
      mailer.send.mockRejectedValue(new Error('boom'));
      const buyerAccount = { id: 'buyer-1', email: 'jane@example.com' };

      await expect(
        service.sendVerificationEmail(buyerAccount as never, store as never),
      ).resolves.toBeUndefined();

      expect(mailer.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'jane@example.com',
          html: expect.stringContaining(
            'https://web.example.com/store/my-store/account/confirm?token=',
          ),
        }),
      );
    });

    it('does nothing when the account has no email', async () => {
      const buyerAccount = { id: 'buyer-1', email: null };

      await service.sendVerificationEmail(
        buyerAccount as never,
        store as never,
      );

      expect(mailer.send).not.toHaveBeenCalled();
    });
  });

  describe('confirmAccount', () => {
    it('throws BadRequestException when no token is given', async () => {
      await expect(
        service.confirmAccount(store.slug, undefined),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when the store does not exist', async () => {
      prisma.store.findUnique.mockResolvedValue(null);
      const token = createCustomerAccountToken('buyer-1', 'test-secret');

      await expect(
        service.confirmAccount('missing-store', token),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for an invalid token signature', async () => {
      await expect(
        service.confirmAccount(store.slug, 'garbage-token'),
      ).rejects.toThrow(BadRequestException);
    });

    it('marks the buyer account verified and returns their orders for this store', async () => {
      const token = createCustomerAccountToken('buyer-1', 'test-secret');
      const buyerAccount = {
        id: 'buyer-1',
        name: 'Jane',
        email: 'jane@example.com',
        phone: '+51988888888',
        emailVerified: false,
        passwordHash: null,
      };
      const orders = [
        {
          id: 'order-1',
          paymentStatus: 'PENDING_PAYMENT',
          fulfillmentStatus: 'ORDERING',
          totalAmount: new Prisma.Decimal('50.00'),
          requiredAmount: new Prisma.Decimal('50.00'),
          currency: 'PEN',
          createdAt: new Date('2026-01-01'),
          payments: [],
        },
      ];
      prisma.buyerAccount.findUnique.mockResolvedValue(buyerAccount);
      prisma.buyerAccount.update.mockResolvedValue({
        ...buyerAccount,
        emailVerified: true,
      });
      prisma.order.findMany.mockResolvedValue(orders);

      const result = await service.confirmAccount(store.slug, token);

      expect(prisma.buyerAccount.update).toHaveBeenCalledWith({
        where: { id: 'buyer-1' },
        data: { emailVerified: true },
      });
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { buyerAccountId: 'buyer-1', storeId: store.id },
        }),
      );
      expect(result.orders).toHaveLength(1);
      expect(result.orders[0]).toEqual(
        expect.objectContaining({
          id: 'order-1',
          paidAmount: 0,
          pendingAmount: 50,
          paidPercentage: 0,
        }),
      );
    });

    it('reports hasPassword: true once a password has been set, without touching emailVerified again', async () => {
      const token = createCustomerAccountToken('buyer-1', 'test-secret');
      const buyerAccount = {
        id: 'buyer-1',
        name: 'Jane',
        email: 'jane@example.com',
        phone: '+51988888888',
        emailVerified: true,
        passwordHash: 'already-set',
      };
      prisma.buyerAccount.findUnique.mockResolvedValue(buyerAccount);
      prisma.order.findMany.mockResolvedValue([]);

      const result = await service.confirmAccount(store.slug, token);

      expect(prisma.buyerAccount.update).not.toHaveBeenCalled();
      expect(result.purpose).toBe('confirm');
      expect(result.customer.hasPassword).toBe(true);
    });

    it("applies a pending email for a 'change-email' token", async () => {
      const token = createCustomerAccountToken(
        'buyer-1',
        'test-secret',
        'change-email',
      );
      const buyerAccount = {
        id: 'buyer-1',
        name: 'Jane',
        email: 'old@example.com',
        pendingEmail: 'new@example.com',
        phone: '+51988888888',
        emailVerified: true,
        passwordHash: 'already-set',
      };
      prisma.buyerAccount.findUnique.mockResolvedValue(buyerAccount);
      prisma.buyerAccount.update.mockResolvedValue({
        ...buyerAccount,
        email: 'new@example.com',
        pendingEmail: null,
      });
      prisma.order.findMany.mockResolvedValue([]);

      const result = await service.confirmAccount(store.slug, token);

      expect(prisma.buyerAccount.update).toHaveBeenCalledWith({
        where: { id: 'buyer-1' },
        data: {
          email: 'new@example.com',
          pendingEmail: null,
          emailVerified: true,
        },
      });
      expect(result.purpose).toBe('change-email');
      expect(result.customer.email).toBe('new@example.com');
    });

    it("applies a pending phone for a 'change-phone' token", async () => {
      const token = createCustomerAccountToken(
        'buyer-1',
        'test-secret',
        'change-phone',
      );
      const buyerAccount = {
        id: 'buyer-1',
        name: 'Jane',
        email: 'jane@example.com',
        phone: '+51900000000',
        pendingPhone: '+51900000001',
        emailVerified: true,
        passwordHash: 'already-set',
      };
      prisma.buyerAccount.findUnique
        .mockResolvedValueOnce(buyerAccount)
        .mockResolvedValueOnce(null); // nobody holds the new phone
      prisma.buyerAccount.updateMany.mockResolvedValue({ count: 1 });
      prisma.buyerAccount.findUniqueOrThrow.mockResolvedValue({
        ...buyerAccount,
        phone: '+51900000001',
        pendingPhone: null,
      });
      prisma.order.findMany.mockResolvedValue([]);

      const result = await service.confirmAccount(store.slug, token);

      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.$executeRaw.mock.calls[0][0].join('?')).toContain(
        'pg_advisory_xact_lock',
      );
      expect(prisma.$executeRaw.mock.calls[0][1]).toBe(
        'buyer-phone:+51900000001',
      );
      expect(prisma.buyerAccount.updateMany).toHaveBeenCalledWith({
        where: { id: 'buyer-1', pendingPhone: { not: null } },
        data: { phone: '+51900000001', pendingPhone: null },
      });
      expect(result.purpose).toBe('change-phone');
      expect(result.customer.phone).toBe('+51900000001');
    });

    it('normalizes an already-unnormalized pendingPhone when applying it (defense in depth)', async () => {
      const token = createCustomerAccountToken(
        'buyer-1',
        'test-secret',
        'change-phone',
      );
      const buyerAccount = {
        id: 'buyer-1',
        name: 'Jane',
        email: 'jane@example.com',
        phone: '+51900000000',
        pendingPhone: '900000001',
        emailVerified: true,
        passwordHash: 'already-set',
      };
      prisma.buyerAccount.findUnique
        .mockResolvedValueOnce(buyerAccount)
        .mockResolvedValueOnce(null);
      prisma.buyerAccount.updateMany.mockResolvedValue({ count: 1 });
      prisma.buyerAccount.findUniqueOrThrow.mockResolvedValue({
        ...buyerAccount,
        phone: '+51900000001',
        pendingPhone: null,
      });
      prisma.order.findMany.mockResolvedValue([]);

      await service.confirmAccount(store.slug, token);

      expect(prisma.buyerAccount.updateMany).toHaveBeenCalledWith({
        where: { id: 'buyer-1', pendingPhone: { not: null } },
        data: { phone: '+51900000001', pendingPhone: null },
      });
    });

    it("rejects a 'change-phone' token when another buyer account already has that phone", async () => {
      const token = createCustomerAccountToken(
        'buyer-1',
        'test-secret',
        'change-phone',
      );
      const buyerAccount = {
        id: 'buyer-1',
        name: 'Jane',
        email: 'jane@example.com',
        phone: '+51900000000',
        pendingPhone: '+51900000001',
        emailVerified: true,
        passwordHash: 'already-set',
      };
      const rival = { ...buyerAccount, id: 'buyer-2' };
      prisma.buyerAccount.findUnique
        .mockResolvedValueOnce(buyerAccount)
        .mockResolvedValueOnce(rival);
      prisma.order.findMany.mockResolvedValue([]);

      await expect(service.confirmAccount(store.slug, token)).rejects.toThrow(
        ConflictException,
      );

      expect(prisma.buyerAccount.updateMany).not.toHaveBeenCalled();
      expect(prisma.buyerAccount.findUnique).toHaveBeenCalledWith({
        where: { phone: '+51900000001' },
      });
    });

    it("does not mutate the buyer account for a 'reset' token", async () => {
      const token = createCustomerAccountToken(
        'buyer-1',
        'test-secret',
        'reset',
      );
      const buyerAccount = {
        id: 'buyer-1',
        name: 'Jane',
        email: 'jane@example.com',
        phone: '+51988888888',
        emailVerified: true,
        passwordHash: 'already-set',
      };
      prisma.buyerAccount.findUnique.mockResolvedValue(buyerAccount);
      prisma.order.findMany.mockResolvedValue([]);

      const result = await service.confirmAccount(store.slug, token);

      expect(prisma.buyerAccount.update).not.toHaveBeenCalled();
      expect(result.purpose).toBe('reset');
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('sends an email with a confirm link', async () => {
      const buyerAccount = { id: 'buyer-1', email: 'jane@example.com' };

      await service.sendPasswordResetEmail(
        buyerAccount as never,
        store as never,
      );

      expect(mailer.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'jane@example.com',
          html: expect.stringContaining(
            'https://web.example.com/store/my-store/account/confirm?token=',
          ),
        }),
      );
    });

    it('links to the global reset page, naming Bias Market, when there is no store', async () => {
      const buyerAccount = { id: 'buyer-1', email: 'jane@example.com' };

      await service.sendPasswordResetEmail(buyerAccount as never, null);

      expect(mailer.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'jane@example.com',
          html: expect.stringContaining(
            'https://web.example.com/my-purchases/reset-password?token=',
          ),
        }),
      );
    });

    it('does nothing when the account has no email', async () => {
      const buyerAccount = { id: 'buyer-1', email: null };

      await service.sendPasswordResetEmail(
        buyerAccount as never,
        store as never,
      );

      expect(mailer.send).not.toHaveBeenCalled();
    });
  });

  describe('sendEmailChangeConfirmation', () => {
    it('sends the confirmation to the new address, not the current one', async () => {
      const buyerAccount = { id: 'buyer-1', email: 'old@example.com' };

      await service.sendEmailChangeConfirmation(
        buyerAccount as never,
        store as never,
        'new@example.com',
      );

      expect(mailer.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'new@example.com' }),
      );
    });
  });

  describe('sendPhoneChangeConfirmation', () => {
    it('sends the confirmation to the current verified email', async () => {
      const buyerAccount = { id: 'buyer-1', email: 'jane@example.com' };

      await service.sendPhoneChangeConfirmation(
        buyerAccount as never,
        store as never,
      );

      expect(mailer.send).toHaveBeenCalledWith(
        expect.objectContaining({ to: 'jane@example.com' }),
      );
    });

    it('does nothing when the account has no email on file', async () => {
      const buyerAccount = { id: 'buyer-1', email: null };

      await service.sendPhoneChangeConfirmation(
        buyerAccount as never,
        store as never,
      );

      expect(mailer.send).not.toHaveBeenCalled();
    });
  });
});
