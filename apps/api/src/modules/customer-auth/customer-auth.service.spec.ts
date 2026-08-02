import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { vi, type Mock } from 'vitest';
import { hashPassword } from 'better-auth/crypto';
import { createCustomerAccountToken, verifyCustomerSessionToken } from '@biasmarket/utils/customer-account-token';
import { CustomerAuthService, derivePasswordVersion } from './customer-auth.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('CustomerAuthService', () => {
  let service: CustomerAuthService;
  let prisma: {
    customer: { findUnique: Mock; update: Mock };
    store: { findUnique: Mock };
  };

  const store = { id: 'store-1', slug: 'my-store' };

  beforeEach(async () => {
    process.env.CUSTOMER_ACCOUNT_TOKEN_SECRET = 'test-secret';

    prisma = {
      customer: { findUnique: vi.fn(), update: vi.fn() },
      store: { findUnique: vi.fn().mockResolvedValue(store) },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CustomerAuthService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(CustomerAuthService);
  });

  describe('register', () => {
    it('sets a password for a verified, not-yet-registered customer', async () => {
      const token = createCustomerAccountToken('customer-1', 'test-secret');
      prisma.customer.findUnique.mockResolvedValue({
        id: 'customer-1',
        storeId: store.id,
        passwordHash: null,
      });

      const result = await service.register('my-store', token, 'super-secret-1');

      expect(result).toEqual({ ok: true });
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'customer-1' },
        data: { passwordHash: expect.any(String), emailVerified: true },
      });
    });

    it('rejects an invalid or expired token', async () => {
      await expect(service.register('my-store', 'not-a-token', 'super-secret-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });

    it('rejects when the token belongs to a customer in a different store', async () => {
      const token = createCustomerAccountToken('customer-1', 'test-secret');
      prisma.customer.findUnique.mockResolvedValue({
        id: 'customer-1',
        storeId: 'other-store',
        passwordHash: null,
      });

      await expect(service.register('my-store', token, 'super-secret-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('rejects re-registration once a password is already set (single-use)', async () => {
      const token = createCustomerAccountToken('customer-1', 'test-secret');
      prisma.customer.findUnique.mockResolvedValue({
        id: 'customer-1',
        storeId: store.id,
        passwordHash: 'already-set',
      });

      await expect(service.register('my-store', token, 'super-secret-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });

    it('rejects when the store does not exist', async () => {
      prisma.store.findUnique.mockResolvedValue(null);

      await expect(service.register('missing-store', 'any-token', 'super-secret-1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('login', () => {
    it('issues a session token on valid credentials, scoped to the store', async () => {
      const passwordHash = await hashPassword('super-secret-1');
      prisma.customer.findUnique.mockResolvedValue({
        id: 'customer-1',
        storeId: store.id,
        passwordHash,
      });

      const token = await service.login('my-store', '+51988888888', 'super-secret-1');

      const verified = verifyCustomerSessionToken(token, 'test-secret');
      expect(verified).toEqual({
        customerId: 'customer-1',
        storeId: store.id,
        passwordVersion: derivePasswordVersion(passwordHash),
      });
    });

    it('rejects a wrong password without revealing which part was wrong', async () => {
      const passwordHash = await hashPassword('super-secret-1');
      prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1', storeId: store.id, passwordHash });

      await expect(service.login('my-store', '+51988888888', 'wrong-password')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects an unknown phone with the same generic error as a wrong password', async () => {
      prisma.customer.findUnique.mockResolvedValue(null);

      await expect(service.login('my-store', '+51900000000', 'super-secret-1')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });

    it('rejects a customer that has never set a password (magic-link only)', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1', storeId: store.id, passwordHash: null });

      await expect(service.login('my-store', '+51988888888', 'anything')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe('changePassword', () => {
    it('rotates the password and issues a fresh session token', async () => {
      const currentHash = await hashPassword('old-password-1');
      prisma.customer.findUnique.mockResolvedValue({
        id: 'customer-1',
        storeId: store.id,
        passwordHash: currentHash,
      });

      const token = await service.changePassword('customer-1', 'old-password-1', 'new-password-1');

      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: 'customer-1' },
        data: { passwordHash: expect.any(String) },
      });
      const verified = verifyCustomerSessionToken(token, 'test-secret');
      expect(verified?.customerId).toBe('customer-1');
      // The new token's embedded version must not match the OLD hash's
      // version — otherwise a token issued before the change would still
      // pass CustomerSessionGuard after it.
      expect(verified?.passwordVersion).not.toBe(derivePasswordVersion(currentHash));
    });

    it('rejects the wrong current password', async () => {
      const currentHash = await hashPassword('old-password-1');
      prisma.customer.findUnique.mockResolvedValue({
        id: 'customer-1',
        storeId: store.id,
        passwordHash: currentHash,
      });

      await expect(service.changePassword('customer-1', 'not-the-current-one', 'new-password-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });

    it('rejects a customer without a password set', async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: 'customer-1', storeId: store.id, passwordHash: null });

      await expect(service.changePassword('customer-1', 'anything', 'new-password-1')).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });
});
