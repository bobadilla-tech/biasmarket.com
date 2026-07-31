import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { vi, type Mock } from 'vitest';
import { CustomerAccountService } from './customer-account.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { MailerService } from '../../../mailer/mailer.service.js';
import { createCustomerAccountToken } from './customer-account-token.js';

describe('CustomerAccountService', () => {
  let service: CustomerAccountService;
  let prisma: {
    customer: { findUnique: Mock; create: Mock; update: Mock };
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
    it('creates a new unverified customer when none exists for the phone', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);
      const created = { id: 'customer-1', email: 'jane@example.com', emailVerified: false };
      prisma.customer.create.mockResolvedValue(created);

      const result = await service.findOrCreateCustomer(
        prisma as never,
        store.id,
        '+51988888888',
        'jane@example.com',
        'Jane',
      );

      expect(prisma.customer.create).toHaveBeenCalledWith({
        data: {
          storeId: store.id,
          phone: '+51988888888',
          email: 'jane@example.com',
          name: 'Jane',
          emailVerified: false,
        },
      });
      expect(result).toEqual({ customer: created, needsVerificationEmail: true });
    });

    it('returns the existing customer without an update when email matches and is verified', async () => {
      const existing = {
        id: 'customer-1',
        email: 'jane@example.com',
        emailVerified: true,
      };
      prisma.customer.findUnique.mockResolvedValue(existing);

      const result = await service.findOrCreateCustomer(
        prisma as never,
        store.id,
        '+51988888888',
        'jane@example.com',
        'Jane',
      );

      expect(prisma.customer.update).not.toHaveBeenCalled();
      expect(result).toEqual({ customer: existing, needsVerificationEmail: false });
    });

    it('re-sends verification when the same unverified email checks out again', async () => {
      const existing = {
        id: 'customer-1',
        email: 'jane@example.com',
        emailVerified: false,
      };
      const updated = { ...existing, emailVerified: false };
      prisma.customer.findUnique.mockResolvedValue(existing);
      prisma.customer.update.mockResolvedValue(updated);

      const result = await service.findOrCreateCustomer(
        prisma as never,
        store.id,
        '+51988888888',
        'jane@example.com',
        'Jane',
      );

      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'customer-1' },
        data: { email: 'jane@example.com', emailVerified: false },
      });
      expect(result).toEqual({ customer: updated, needsVerificationEmail: true });
    });

    it('does not touch a verified customer when a different email is submitted for the same phone', async () => {
      const existing = {
        id: 'customer-1',
        email: 'jane@example.com',
        emailVerified: true,
      };
      prisma.customer.findUnique.mockResolvedValue(existing);

      const result = await service.findOrCreateCustomer(
        prisma as never,
        store.id,
        '+51988888888',
        'attacker@example.com',
        'Attacker',
      );

      expect(prisma.customer.update).not.toHaveBeenCalled();
      expect(prisma.customer.create).not.toHaveBeenCalled();
      expect(result).toEqual({ customer: null, needsVerificationEmail: false });
    });

    it('does not touch an unverified customer when a different email is submitted for the same phone', async () => {
      const existing = {
        id: 'customer-1',
        email: 'jane@example.com',
        emailVerified: false,
      };
      prisma.customer.findUnique.mockResolvedValue(existing);

      const result = await service.findOrCreateCustomer(
        prisma as never,
        store.id,
        '+51988888888',
        'someone-else@example.com',
        'Someone Else',
      );

      expect(prisma.customer.update).not.toHaveBeenCalled();
      expect(result).toEqual({ customer: null, needsVerificationEmail: false });
    });
  });

  describe('sendVerificationEmail', () => {
    it('sends an email with a confirm link and never throws on mailer failure', async () => {
      mailer.send.mockRejectedValue(new Error('boom'));
      const customer = { id: 'customer-1', email: 'jane@example.com' };

      await expect(
        service.sendVerificationEmail(customer as never, store as never),
      ).resolves.toBeUndefined();

      expect(mailer.send).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'jane@example.com',
          html: expect.stringContaining('https://web.example.com/store/my-store/account/confirm?token='),
        }),
      );
    });

    it('does nothing when the customer has no email', async () => {
      const customer = { id: 'customer-1', email: null };

      await service.sendVerificationEmail(customer as never, store as never);

      expect(mailer.send).not.toHaveBeenCalled();
    });
  });

  describe('confirmAccount', () => {
    it('throws BadRequestException when no token is given', async () => {
      await expect(service.confirmAccount(store.slug, undefined)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when the store does not exist', async () => {
      prisma.store.findUnique.mockResolvedValue(null);
      const token = createCustomerAccountToken('customer-1', 'test-secret');

      await expect(service.confirmAccount('missing-store', token)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException for an invalid token signature', async () => {
      await expect(service.confirmAccount(store.slug, 'garbage-token')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('marks the customer verified and returns their orders for this store', async () => {
      const token = createCustomerAccountToken('customer-1', 'test-secret');
      const customer = {
        id: 'customer-1',
        storeId: store.id,
        name: 'Jane',
        email: 'jane@example.com',
        phone: '+51988888888',
        emailVerified: false,
      };
      const orders = [{ id: 'order-1', paymentStatus: 'PENDING_PAYMENT' }];
      prisma.customer.findUnique.mockResolvedValue(customer);
      prisma.customer.update.mockResolvedValue({ ...customer, emailVerified: true });
      prisma.order.findMany.mockResolvedValue(orders);

      const result = await service.confirmAccount(store.slug, token);

      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'customer-1' },
        data: { emailVerified: true },
      });
      expect(result).toEqual({
        customer: { name: 'Jane', email: 'jane@example.com', phone: '+51988888888' },
        orders,
      });
    });
  });
});
