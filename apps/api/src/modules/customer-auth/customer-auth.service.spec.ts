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

describe('CustomerAuthService', () => {
  let service: CustomerAuthService;
  let prisma: {
    buyerAccount: {
      findUnique: Mock;
      findUniqueOrThrow: Mock;
      findFirst: Mock;
      update: Mock;
    };
    customerStoreLink: { upsert: Mock };
    store: { findUnique: Mock };
    order: { findMany: Mock };
  };
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
        update: vi.fn(),
      },
      customerStoreLink: { upsert: vi.fn() },
      store: { findUnique: vi.fn().mockResolvedValue(store) },
      order: { findMany: vi.fn() },
    };
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
