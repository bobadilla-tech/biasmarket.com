import { Test, type TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { type Mock, vi } from 'vitest';
import { CustomerAccountService } from './customer-account.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { MailerService } from '../../../mailer/mailer.service.js';
import { createCustomerAccountToken } from '@biasmarket/utils/customer-account-token';

describe('CustomerAccountService', () => {
  let service: CustomerAccountService;
  let prisma: {
    customer: { findUnique: Mock; create: Mock; update: Mock };
    buyerAccount: { findUnique: Mock; create: Mock; update: Mock };
    customerStoreLink: { upsert: Mock };
    order: { findMany: Mock };
    store: { findUnique: Mock };
  };
  let mailer: { send: Mock };

  const store = { id: 'store-1', slug: 'my-store', name: 'My Store' };

  beforeEach(async () => {
    process.env.CUSTOMER_ACCOUNT_TOKEN_SECRET = 'test-secret';
    process.env.WEB_URL = 'https://web.example.com';

    prisma = {
      customer: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
      buyerAccount: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
      customerStoreLink: { upsert: vi.fn() },
      order: { findMany: vi.fn() },
      store: { findUnique: vi.fn().mockResolvedValue(store) },
    };
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
    it('creates a new BuyerAccount, links the store, and creates the per-store Customer projection', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue(null);
      const buyerAccount = {
        id: 'buyer-1',
        email: 'jane@example.com',
        emailVerified: false,
      };
      prisma.buyerAccount.create.mockResolvedValue(buyerAccount);
      prisma.customer.findUnique.mockResolvedValue(null);
      const customer = {
        id: 'customer-1',
        email: 'jane@example.com',
        emailVerified: false,
      };
      prisma.customer.create.mockResolvedValue(customer);

      const result = await service.findOrCreateCustomer(
        prisma as never,
        store.id,
        '+51988888888',
        'jane@example.com',
        'Jane',
      );

      expect(prisma.buyerAccount.create).toHaveBeenCalledWith({
        data: {
          phone: '+51988888888',
          email: 'jane@example.com',
          name: 'Jane',
          emailVerified: false,
        },
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
      expect(prisma.customer.create).toHaveBeenCalledWith({
        data: {
          storeId: store.id,
          phone: '+51988888888',
          email: 'jane@example.com',
          name: 'Jane',
          emailVerified: false,
        },
      });
      expect(result).toEqual({
        customer,
        buyerAccount,
        needsVerificationEmail: true,
      });
    });

    it('normalizes a differently-formatted phone before every lookup and write', async () => {
      prisma.buyerAccount.findUnique.mockResolvedValue(null);
      prisma.buyerAccount.create.mockResolvedValue({
        id: 'buyer-1',
        email: 'jane@example.com',
        emailVerified: false,
      });
      prisma.customer.findUnique.mockResolvedValue(null);
      prisma.customer.create.mockResolvedValue({
        id: 'customer-1',
        email: 'jane@example.com',
        emailVerified: false,
      });

      await service.findOrCreateCustomer(
        prisma as never,
        store.id,
        '988888888',
        'jane@example.com',
        'Jane',
      );

      expect(prisma.buyerAccount.findUnique).toHaveBeenCalledWith({
        where: { phone: '+51988888888' },
      });
      expect(prisma.customer.findUnique).toHaveBeenCalledWith({
        where: {
          storeId_phone: { storeId: store.id, phone: '+51988888888' },
        },
      });
    });

    it('reuses an existing verified BuyerAccount as-is, but still upserts the per-store Customer projection', async () => {
      const buyerAccount = {
        id: 'buyer-1',
        email: 'jane@example.com',
        emailVerified: true,
      };
      prisma.buyerAccount.findUnique.mockResolvedValue(buyerAccount);
      const existingCustomer = { id: 'customer-1', storeId: store.id };
      prisma.customer.findUnique.mockResolvedValue(existingCustomer);
      const updatedCustomer = {
        ...existingCustomer,
        email: 'jane@example.com',
        emailVerified: true,
      };
      prisma.customer.update.mockResolvedValue(updatedCustomer);

      const result = await service.findOrCreateCustomer(
        prisma as never,
        store.id,
        '+51988888888',
        'jane@example.com',
        'Jane',
      );

      expect(prisma.buyerAccount.update).not.toHaveBeenCalled();
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'customer-1' },
        data: { email: 'jane@example.com', name: 'Jane', emailVerified: true },
      });
      expect(result).toEqual({
        customer: updatedCustomer,
        buyerAccount,
        needsVerificationEmail: false,
      });
    });

    it('re-sends verification when the same unverified email checks out again', async () => {
      const existing = {
        id: 'buyer-1',
        email: 'jane@example.com',
        emailVerified: false,
      };
      const updated = { ...existing, emailVerified: false };
      prisma.buyerAccount.findUnique.mockResolvedValue(existing);
      prisma.buyerAccount.update.mockResolvedValue(updated);
      prisma.customer.findUnique.mockResolvedValue(null);
      prisma.customer.create.mockResolvedValue({
        id: 'customer-1',
        email: 'jane@example.com',
        emailVerified: false,
      });

      const result = await service.findOrCreateCustomer(
        prisma as never,
        store.id,
        '+51988888888',
        'jane@example.com',
        'Jane',
      );

      expect(prisma.buyerAccount.update).toHaveBeenCalledWith({
        where: { id: 'buyer-1' },
        data: { email: 'jane@example.com', emailVerified: false },
      });
      expect(result.buyerAccount).toEqual(updated);
      expect(result.needsVerificationEmail).toBe(true);
    });

    it('does not create a link or touch anything when a different email is submitted for a verified account (identity mismatch guard)', async () => {
      const existing = {
        id: 'buyer-1',
        email: 'jane@example.com',
        emailVerified: true,
      };
      prisma.buyerAccount.findUnique.mockResolvedValue(existing);

      const result = await service.findOrCreateCustomer(
        prisma as never,
        store.id,
        '+51988888888',
        'attacker@example.com',
        'Attacker',
      );

      expect(prisma.buyerAccount.update).not.toHaveBeenCalled();
      expect(prisma.customerStoreLink.upsert).not.toHaveBeenCalled();
      expect(prisma.customer.create).not.toHaveBeenCalled();
      expect(prisma.customer.update).not.toHaveBeenCalled();
      expect(result).toEqual({
        customer: null,
        buyerAccount: null,
        needsVerificationEmail: false,
      });
    });

    it('does not create a link or touch anything when a different email is submitted for an unverified account (identity mismatch guard)', async () => {
      const existing = {
        id: 'buyer-1',
        email: 'jane@example.com',
        emailVerified: false,
      };
      prisma.buyerAccount.findUnique.mockResolvedValue(existing);

      const result = await service.findOrCreateCustomer(
        prisma as never,
        store.id,
        '+51988888888',
        'someone-else@example.com',
        'Someone Else',
      );

      expect(prisma.buyerAccount.update).not.toHaveBeenCalled();
      expect(prisma.customerStoreLink.upsert).not.toHaveBeenCalled();
      expect(result).toEqual({
        customer: null,
        buyerAccount: null,
        needsVerificationEmail: false,
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
      const orders = [{ id: 'order-1', paymentStatus: 'PENDING_PAYMENT' }];
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
      expect(result).toEqual({
        purpose: 'confirm',
        customer: {
          name: 'Jane',
          email: 'jane@example.com',
          phone: '+51988888888',
          hasPassword: false,
        },
        orders,
      });
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
      prisma.buyerAccount.findUnique.mockResolvedValue(buyerAccount);
      prisma.buyerAccount.update.mockResolvedValue({
        ...buyerAccount,
        phone: '+51900000001',
        pendingPhone: null,
      });
      prisma.order.findMany.mockResolvedValue([]);

      const result = await service.confirmAccount(store.slug, token);

      expect(prisma.buyerAccount.update).toHaveBeenCalledWith({
        where: { id: 'buyer-1' },
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
      prisma.buyerAccount.findUnique.mockResolvedValue(buyerAccount);
      prisma.buyerAccount.update.mockResolvedValue({
        ...buyerAccount,
        phone: '+51900000001',
        pendingPhone: null,
      });
      prisma.order.findMany.mockResolvedValue([]);

      await service.confirmAccount(store.slug, token);

      expect(prisma.buyerAccount.update).toHaveBeenCalledWith({
        where: { id: 'buyer-1' },
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

      expect(prisma.buyerAccount.update).not.toHaveBeenCalled();
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
