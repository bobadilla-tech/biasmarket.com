import { Test, TestingModule } from "@nestjs/testing";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { type Mock, vi } from "vitest";
import { hashPassword } from "better-auth/crypto";
import {
  createCustomerAccountToken,
  verifyCustomerSessionToken,
} from "@biasmarket/utils/customer-account-token";
import {
  CustomerAuthService,
  derivePasswordVersion,
} from "./customer-auth.service.js";
import { PrismaService } from "../../prisma/prisma.service.js";
import { CustomerAccountService } from "../orders/application/customer-account.service.js";

describe("CustomerAuthService", () => {
  let service: CustomerAuthService;
  let prisma: {
    customer: {
      findUnique: Mock;
      findUniqueOrThrow: Mock;
      findFirst: Mock;
      update: Mock;
    };
    store: { findUnique: Mock };
    order: { findMany: Mock };
  };
  let customerAccount: {
    sendPasswordResetEmail: Mock;
    sendEmailChangeConfirmation: Mock;
    sendPhoneChangeConfirmation: Mock;
  };

  const store = { id: "store-1", slug: "my-store" };

  beforeEach(async () => {
    process.env.CUSTOMER_ACCOUNT_TOKEN_SECRET = "test-secret";

    prisma = {
      customer: {
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
      store: { findUnique: vi.fn().mockResolvedValue(store) },
      order: { findMany: vi.fn() },
    };
    customerAccount = {
      sendPasswordResetEmail: vi.fn(),
      sendEmailChangeConfirmation: vi.fn(),
      sendPhoneChangeConfirmation: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CustomerAuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: CustomerAccountService, useValue: customerAccount },
      ],
    }).compile();

    service = module.get(CustomerAuthService);
  });

  describe("register", () => {
    it("sets a password for a verified, not-yet-registered customer", async () => {
      const token = createCustomerAccountToken("customer-1", "test-secret");
      prisma.customer.findUnique.mockResolvedValue({
        id: "customer-1",
        storeId: store.id,
        passwordHash: null,
      });

      const result = await service.register(
        "my-store",
        token,
        "super-secret-1",
      );

      expect(result).toEqual({ ok: true });
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: "customer-1" },
        data: { passwordHash: expect.any(String), emailVerified: true },
      });
    });

    it("rejects an invalid or expired token", async () => {
      await expect(
        service.register("my-store", "not-a-token", "super-secret-1"),
      ).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });

    it("rejects when the token belongs to a customer in a different store", async () => {
      const token = createCustomerAccountToken("customer-1", "test-secret");
      prisma.customer.findUnique.mockResolvedValue({
        id: "customer-1",
        storeId: "other-store",
        passwordHash: null,
      });

      await expect(service.register("my-store", token, "super-secret-1"))
        .rejects.toBeInstanceOf(
          BadRequestException,
        );
    });

    it("rejects re-registration once a password is already set (single-use)", async () => {
      const token = createCustomerAccountToken("customer-1", "test-secret");
      prisma.customer.findUnique.mockResolvedValue({
        id: "customer-1",
        storeId: store.id,
        passwordHash: "already-set",
      });

      await expect(service.register("my-store", token, "super-secret-1"))
        .rejects.toBeInstanceOf(
          ConflictException,
        );
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });

    it("rejects when the store does not exist", async () => {
      prisma.store.findUnique.mockResolvedValue(null);

      await expect(
        service.register("missing-store", "any-token", "super-secret-1"),
      ).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it("allows a 'reset'-purpose token to overwrite an existing password", async () => {
      const token = createCustomerAccountToken(
        "customer-1",
        "test-secret",
        "reset",
      );
      prisma.customer.findUnique.mockResolvedValue({
        id: "customer-1",
        storeId: store.id,
        passwordHash: "already-set",
      });

      const result = await service.register(
        "my-store",
        token,
        "brand-new-password-1",
      );

      expect(result).toEqual({ ok: true });
      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: "customer-1" },
        data: { passwordHash: expect.any(String) },
      });
    });

    it("rejects a 'change-email'-purpose token — not a valid purpose for setting a password", async () => {
      const token = createCustomerAccountToken(
        "customer-1",
        "test-secret",
        "change-email",
      );

      await expect(service.register("my-store", token, "super-secret-1"))
        .rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });
  });

  describe("forgotPassword", () => {
    it("sends a reset email when the phone matches a registered customer", async () => {
      const customer = {
        id: "customer-1",
        storeId: store.id,
        email: "jane@example.com",
        passwordHash: "already-set",
      };
      prisma.customer.findUnique.mockResolvedValue(customer);

      await service.forgotPassword("my-store", "+51988888888");

      expect(customerAccount.sendPasswordResetEmail).toHaveBeenCalledWith(
        customer,
        store,
      );
    });

    it("silently no-ops when the phone doesn't match any customer", async () => {
      prisma.customer.findUnique.mockResolvedValue(null);

      await expect(service.forgotPassword("my-store", "+51900000000"))
        .resolves.toBeUndefined();
      expect(customerAccount.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it("silently no-ops when the customer never set a password", async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: "customer-1",
        storeId: store.id,
        email: "jane@example.com",
        passwordHash: null,
      });

      await service.forgotPassword("my-store", "+51988888888");

      expect(customerAccount.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe("login", () => {
    it("issues a session token on valid credentials, scoped to the store", async () => {
      const passwordHash = await hashPassword("super-secret-1");
      prisma.customer.findUnique.mockResolvedValue({
        id: "customer-1",
        storeId: store.id,
        passwordHash,
      });

      const token = await service.login(
        "my-store",
        "+51988888888",
        "super-secret-1",
      );

      const verified = verifyCustomerSessionToken(token, "test-secret");
      expect(verified).toEqual({
        customerId: "customer-1",
        storeId: store.id,
        passwordVersion: derivePasswordVersion(passwordHash),
      });
    });

    it("rejects a wrong password without revealing which part was wrong", async () => {
      const passwordHash = await hashPassword("super-secret-1");
      prisma.customer.findUnique.mockResolvedValue({
        id: "customer-1",
        storeId: store.id,
        passwordHash,
      });

      await expect(service.login("my-store", "+51988888888", "wrong-password"))
        .rejects.toBeInstanceOf(
          UnauthorizedException,
        );
    });

    it("rejects an unknown phone with the same generic error as a wrong password", async () => {
      prisma.customer.findUnique.mockResolvedValue(null);

      await expect(service.login("my-store", "+51900000000", "super-secret-1"))
        .rejects.toBeInstanceOf(
          UnauthorizedException,
        );
    });

    it("rejects a customer that has never set a password (magic-link only)", async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: "customer-1",
        storeId: store.id,
        passwordHash: null,
      });

      await expect(service.login("my-store", "+51988888888", "anything"))
        .rejects.toBeInstanceOf(
          UnauthorizedException,
        );
    });
  });

  describe("changePassword", () => {
    it("rotates the password and issues a fresh session token", async () => {
      const currentHash = await hashPassword("old-password-1");
      prisma.customer.findUnique.mockResolvedValue({
        id: "customer-1",
        storeId: store.id,
        passwordHash: currentHash,
      });

      const token = await service.changePassword(
        "customer-1",
        "old-password-1",
        "new-password-1",
      );

      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: "customer-1" },
        data: { passwordHash: expect.any(String) },
      });
      const verified = verifyCustomerSessionToken(token, "test-secret");
      expect(verified?.customerId).toBe("customer-1");
      // The new token's embedded version must not match the OLD hash's
      // version — otherwise a token issued before the change would still
      // pass CustomerSessionGuard after it.
      expect(verified?.passwordVersion).not.toBe(
        derivePasswordVersion(currentHash),
      );
    });

    it("rejects the wrong current password", async () => {
      const currentHash = await hashPassword("old-password-1");
      prisma.customer.findUnique.mockResolvedValue({
        id: "customer-1",
        storeId: store.id,
        passwordHash: currentHash,
      });

      await expect(
        service.changePassword(
          "customer-1",
          "not-the-current-one",
          "new-password-1",
        ),
      ).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });

    it("rejects a customer without a password set", async () => {
      prisma.customer.findUnique.mockResolvedValue({
        id: "customer-1",
        storeId: store.id,
        passwordHash: null,
      });

      await expect(
        service.changePassword("customer-1", "anything", "new-password-1"),
      ).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    });
  });

  describe("getProfile", () => {
    const session = { id: "customer-1", storeId: store.id };

    it("returns the customer plus their order history, scoped to their own store", async () => {
      prisma.customer.findUniqueOrThrow.mockResolvedValue({
        id: "customer-1",
        storeId: store.id,
        name: "Jane",
        email: "jane@example.com",
        phone: "+51988888888",
        emailVerified: true,
      });
      const orders = [{
        id: "order-1",
        paymentStatus: "VERIFIED",
        fulfillmentStatus: "READY",
      }];
      prisma.order.findMany.mockResolvedValue(orders);

      const result = await service.getProfile("my-store", session);

      expect(result).toEqual({
        customer: {
          name: "Jane",
          email: "jane@example.com",
          phone: "+51988888888",
          emailVerified: true,
        },
        orders,
      });
      expect(prisma.order.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { customerId: "customer-1", storeId: store.id },
        }),
      );
    });

    it("rejects when the route slug belongs to a different store than the session", async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: "other-store-id",
        slug: "a-different-store",
      });

      await expect(service.getProfile("a-different-store", session)).rejects
        .toBeInstanceOf(
          ForbiddenException,
        );
      expect(prisma.customer.findUniqueOrThrow).not.toHaveBeenCalled();
    });

    it("rejects when the store does not exist", async () => {
      prisma.store.findUnique.mockResolvedValue(null);

      await expect(service.getProfile("missing-store", session)).rejects
        .toBeInstanceOf(NotFoundException);
    });
  });

  describe("updateProfile", () => {
    const session = { id: "customer-1", storeId: store.id };
    const currentCustomer = {
      id: "customer-1",
      storeId: store.id,
      name: "Old Name",
      email: "old@example.com",
      phone: "+51988888888",
      emailVerified: true,
    };

    beforeEach(() => {
      prisma.customer.findUniqueOrThrow.mockResolvedValue(currentCustomer);
    });

    it("updates the name only", async () => {
      prisma.customer.update.mockResolvedValue({
        ...currentCustomer,
        name: "New Name",
      });

      const result = await service.updateProfile("my-store", session, {
        name: "New Name",
      });

      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: "customer-1" },
        data: { name: "New Name" },
      });
      expect(result).toEqual({
        name: "New Name",
        pendingEmail: undefined,
        pendingPhone: undefined,
      });
    });

    it("rejects when the route slug belongs to a different store than the session", async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: "other-store-id",
        slug: "a-different-store",
      });

      await expect(
        service.updateProfile("a-different-store", session, {
          name: "New Name",
        }),
      ).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });

    it("stages a new email and sends a confirmation to the new address", async () => {
      prisma.customer.findFirst.mockResolvedValue(null);
      prisma.customer.update.mockResolvedValue({
        ...currentCustomer,
        pendingEmail: "new@example.com",
      });

      await service.updateProfile("my-store", session, {
        name: "Old Name",
        email: "new@example.com",
      });

      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: "customer-1" },
        data: { name: "Old Name", pendingEmail: "new@example.com" },
      });
      expect(customerAccount.sendEmailChangeConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({ pendingEmail: "new@example.com" }),
        store,
        "new@example.com",
      );
    });

    it("rejects an email already used by another customer in the store", async () => {
      prisma.customer.findFirst.mockResolvedValue({ id: "other-customer" });

      await expect(
        service.updateProfile("my-store", session, {
          name: "Old Name",
          email: "taken@example.com",
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });

    it("stages a new phone and sends a confirmation to the current verified email", async () => {
      prisma.customer.findUnique.mockResolvedValue(null);
      prisma.customer.update.mockResolvedValue({
        ...currentCustomer,
        pendingPhone: "+51900000001",
      });

      await service.updateProfile("my-store", session, {
        name: "Old Name",
        phone: "+51900000001",
      });

      expect(prisma.customer.update).toHaveBeenCalledWith({
        where: { id: "customer-1" },
        data: { name: "Old Name", pendingPhone: "+51900000001" },
      });
      expect(customerAccount.sendPhoneChangeConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({ pendingPhone: "+51900000001" }),
        store,
      );
    });

    it("rejects a phone change when the current email isn't verified yet", async () => {
      prisma.customer.findUniqueOrThrow.mockResolvedValue({
        ...currentCustomer,
        emailVerified: false,
      });

      await expect(
        service.updateProfile("my-store", session, {
          name: "Old Name",
          phone: "+51900000001",
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });

    it("rejects a phone already used by another customer in the store", async () => {
      prisma.customer.findUnique.mockResolvedValue({ id: "other-customer" });

      await expect(
        service.updateProfile("my-store", session, {
          name: "Old Name",
          phone: "+51900000001",
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.customer.update).not.toHaveBeenCalled();
    });
  });
});
