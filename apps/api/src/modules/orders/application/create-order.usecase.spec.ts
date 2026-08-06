import { Test, type TestingModule } from "@nestjs/testing";
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { type Mock, vi } from "vitest";
import { CreateOrderUseCase } from "./create-order.usecase.js";
import { PrismaService } from "../../../prisma/prisma.service.js";
import { NotificationsService } from "../../notifications/notifications.service.js";
import { CustomerAccountService } from "./customer-account.service.js";

// Minimal stand-in for the decimal.js `Decimal` instances the real
// PrismaService returns for `Decimal(10,2)` columns — the unit-test alias
// for `@biasmarket/db` (see vitest.config.ts) only stubs `PrismaClient`, so
// tests can't construct a real one. This supports the subset of the API
// (`times`/`plus`/`toNumber`) the use case actually calls.
class FakeDecimal {
  constructor(private readonly value: number) {}
  times(n: number) {
    return new FakeDecimal(this.value * n);
  }
  plus(n: number | FakeDecimal) {
    return new FakeDecimal(
      this.value + (n instanceof FakeDecimal ? n.value : n),
    );
  }
  toNumber() {
    return this.value;
  }
}

describe("CreateOrderUseCase", () => {
  let useCase: CreateOrderUseCase;
  let prisma: {
    store: { findUnique: Mock };
    deliveryMethodConfig: { findUnique: Mock };
    pickupPoint: { count: Mock; findUnique: Mock };
    $transaction: Mock;
    product: { findUnique: Mock };
    productVariant: { findUnique: Mock; update: Mock };
    order: { create: Mock };
  };
  let notifications: { syncStockAlerts: Mock };
  let customerAccounts: {
    findOrCreateCustomer: Mock;
    sendVerificationEmail: Mock;
  };

  const slug = "my-store";
  const store = {
    id: "store-1",
    slug,
    name: "My Store",
    holdWindowHours: 48,
    whatsappNumber: "+51999999999",
  };
  const deliveryConfig = {
    storeId: store.id,
    type: "PICKUP",
    enabled: true,
    details: { estimatedCost: 0 },
  };

  const dto = {
    deliveryMethodType: "PICKUP" as const,
    customerPhone: "+51988888888",
    customerName: "Jane",
    items: [{ productId: "product-1", quantity: 2 }],
  };

  beforeEach(async () => {
    prisma = {
      store: { findUnique: vi.fn() },
      deliveryMethodConfig: { findUnique: vi.fn() },
      pickupPoint: { count: vi.fn(), findUnique: vi.fn() },
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
      product: { findUnique: vi.fn() },
      productVariant: { findUnique: vi.fn(), update: vi.fn() },
      order: { create: vi.fn() },
    };
    notifications = { syncStockAlerts: vi.fn() };
    customerAccounts = {
      findOrCreateCustomer: vi.fn(),
      sendVerificationEmail: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreateOrderUseCase,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationsService, useValue: notifications },
        { provide: CustomerAccountService, useValue: customerAccounts },
      ],
    }).compile();

    useCase = module.get(CreateOrderUseCase);

    prisma.store.findUnique.mockResolvedValue(store);
    prisma.deliveryMethodConfig.findUnique.mockResolvedValue(deliveryConfig);
    prisma.pickupPoint.count.mockResolvedValue(0);
  });

  it("throws NotFoundException when the store does not exist", async () => {
    prisma.store.findUnique.mockResolvedValue(null);

    await expect(useCase.execute(slug, dto)).rejects.toThrow(NotFoundException);
  });

  it("throws BadRequestException when the delivery method is not configured", async () => {
    prisma.deliveryMethodConfig.findUnique.mockResolvedValue(null);

    await expect(useCase.execute(slug, dto)).rejects.toThrow(
      BadRequestException,
    );
  });

  it("throws BadRequestException when the delivery method is disabled", async () => {
    prisma.deliveryMethodConfig.findUnique.mockResolvedValue({
      ...deliveryConfig,
      enabled: false,
    });

    await expect(useCase.execute(slug, dto)).rejects.toThrow(
      BadRequestException,
    );
  });

  it("throws BadRequestException for an unpublished product", async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: "product-1",
      storeId: store.id,
      status: "DRAFT",
      deletedAt: null,
      price: new FakeDecimal(10),
      currency: "PEN",
      name: "Widget",
      variants: [],
    });

    await expect(useCase.execute(slug, dto)).rejects.toThrow(
      BadRequestException,
    );
  });

  it("throws BadRequestException when variant stock is insufficient", async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: "product-1",
      storeId: store.id,
      status: "PUBLISHED",
      deletedAt: null,
      price: new FakeDecimal(10),
      currency: "PEN",
      name: "Widget",
    });
    prisma.productVariant.findUnique.mockResolvedValue({
      id: "variant-1",
      productId: "product-1",
      name: "Large",
      stock: 1,
      reserved: 0,
      priceOverride: null,
    });

    await expect(
      useCase.execute(slug, {
        ...dto,
        items: [{ ...dto.items[0], variantId: "variant-1" }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("throws BadRequestException for a multi-variant product when no variant was selected", async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: "product-1",
      storeId: store.id,
      status: "PUBLISHED",
      deletedAt: null,
      price: new FakeDecimal(10),
      currency: "PEN",
      name: "Widget",
      variants: [{ id: "variant-1", name: "Large", stock: 5, reserved: 0 }],
    });

    await expect(useCase.execute(slug, dto)).rejects.toThrow(
      BadRequestException,
    );
  });

  it("reserves stock, computes the total, and creates the order", async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: "product-1",
      storeId: store.id,
      status: "PUBLISHED",
      deletedAt: null,
      price: new FakeDecimal(10),
      currency: "PEN",
      name: "Widget",
    });
    prisma.productVariant.findUnique.mockResolvedValue({
      id: "variant-1",
      productId: "product-1",
      name: "Large",
      stock: 5,
      reserved: 0,
      priceOverride: null,
    });
    prisma.order.create.mockResolvedValue({
      id: "order-1",
      totalAmount: new FakeDecimal(20),
      currency: "PEN",
      deliveryMethodType: "PICKUP",
      customerName: "Jane",
      customerPhone: dto.customerPhone,
    });
    prisma.productVariant.update.mockResolvedValue({
      id: "variant-1",
      productId: "product-1",
      name: "Large",
      stock: 5,
      reserved: 2,
    });

    const result = await useCase.execute(slug, {
      ...dto,
      items: [{ ...dto.items[0], variantId: "variant-1" }],
    });

    expect(prisma.productVariant.update).toHaveBeenCalledWith({
      where: { id: "variant-1" },
      data: { reserved: { increment: 2 } },
    });
    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          storeId: store.id,
          customerPhone: dto.customerPhone,
          totalAmount: expect.any(FakeDecimal),
          requiredAmount: expect.any(FakeDecimal),
        }),
      }),
    );
    expect(result.whatsappUrl).toContain("https://wa.me/51999999999");
    expect(result.whatsappUrl).toContain(encodeURIComponent("20.00 PEN"));
    expect(result.whatsappUrl).toContain(encodeURIComponent("Widget (Large)"));
    expect(notifications.syncStockAlerts).toHaveBeenCalledWith(
      prisma,
      store,
      expect.objectContaining({ id: "product-1" }),
      expect.objectContaining({ id: "variant-1" }),
    );
  });

  it("rejects a cart mixing products with different currencies", async () => {
    prisma.product.findUnique
      .mockResolvedValueOnce({
        id: "product-1",
        storeId: store.id,
        status: "PUBLISHED",
        deletedAt: null,
        price: new FakeDecimal(10),
        currency: "PEN",
        name: "Widget",
        variants: [],
      })
      .mockResolvedValueOnce({
        id: "product-2",
        storeId: store.id,
        status: "PUBLISHED",
        deletedAt: null,
        price: new FakeDecimal(10),
        currency: "USD",
        name: "Gadget",
        variants: [],
      });

    await expect(
      useCase.execute(slug, {
        ...dto,
        items: [
          { productId: "product-1", quantity: 1 },
          { productId: "product-2", quantity: 1 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it("does not build a whatsapp url when the store has no whatsappNumber configured", async () => {
    prisma.store.findUnique.mockResolvedValue({
      ...store,
      whatsappNumber: null,
    });
    prisma.product.findUnique.mockResolvedValue({
      id: "product-1",
      storeId: store.id,
      status: "PUBLISHED",
      deletedAt: null,
      price: new FakeDecimal(10),
      currency: "PEN",
      name: "Widget",
      variants: [],
    });
    prisma.order.create.mockResolvedValue({
      id: "order-1",
      totalAmount: new FakeDecimal(20),
      currency: "PEN",
      deliveryMethodType: "PICKUP",
      customerName: "Jane",
      customerPhone: dto.customerPhone,
    });

    const result = await useCase.execute(slug, dto);

    expect(result.whatsappUrl).toBeNull();
  });

  describe("customer accounts", () => {
    beforeEach(() => {
      prisma.product.findUnique.mockResolvedValue({
        id: "product-1",
        storeId: store.id,
        status: "PUBLISHED",
        deletedAt: null,
        price: new FakeDecimal(10),
        currency: "PEN",
        name: "Widget",
        variants: [],
      });
      prisma.order.create.mockResolvedValue({
        id: "order-1",
        totalAmount: new FakeDecimal(20),
        currency: "PEN",
        deliveryMethodType: "PICKUP",
        customerName: "Jane",
        customerPhone: dto.customerPhone,
      });
    });

    it("does not touch customer accounts when no email was provided", async () => {
      await useCase.execute(slug, dto);

      expect(customerAccounts.findOrCreateCustomer).not.toHaveBeenCalled();
      expect(customerAccounts.sendVerificationEmail).not.toHaveBeenCalled();
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ customerId: undefined }),
        }),
      );
    });

    it("links the order to the customer account and sends a verification email for a new/unverified customer", async () => {
      const customer = {
        id: "customer-1",
        storeId: store.id,
        email: "jane@example.com",
      };
      customerAccounts.findOrCreateCustomer.mockResolvedValue({
        customer,
        needsVerificationEmail: true,
      });

      await useCase.execute(slug, {
        ...dto,
        customerEmail: "jane@example.com",
      });

      expect(customerAccounts.findOrCreateCustomer).toHaveBeenCalledWith(
        prisma,
        store.id,
        dto.customerPhone,
        "jane@example.com",
        dto.customerName,
      );
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ customerId: "customer-1" }),
        }),
      );
      expect(customerAccounts.sendVerificationEmail).toHaveBeenCalledWith(
        customer,
        store,
      );
    });

    it("skips the verification email for an already-verified repeat customer", async () => {
      const customer = {
        id: "customer-1",
        storeId: store.id,
        email: "jane@example.com",
      };
      customerAccounts.findOrCreateCustomer.mockResolvedValue({
        customer,
        needsVerificationEmail: false,
      });

      await useCase.execute(slug, {
        ...dto,
        customerEmail: "jane@example.com",
      });

      expect(customerAccounts.sendVerificationEmail).not.toHaveBeenCalled();
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ customerId: customer.id }),
        }),
      );
    });

    it("does not link the order to a customer when the mismatch guard returns null", async () => {
      customerAccounts.findOrCreateCustomer.mockResolvedValue({
        customer: null,
        needsVerificationEmail: false,
      });

      await useCase.execute(slug, {
        ...dto,
        customerEmail: "attacker@example.com",
      });

      expect(customerAccounts.sendVerificationEmail).not.toHaveBeenCalled();
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ customerId: undefined }),
        }),
      );
    });
  });

  describe("pickup points", () => {
    const point = {
      id: "point-1",
      storeId: store.id,
      label: "Alameda 28 de Julio",
      enabled: true,
    };

    beforeEach(() => {
      prisma.product.findUnique.mockResolvedValue({
        id: "product-1",
        storeId: store.id,
        status: "PUBLISHED",
        deletedAt: null,
        price: new FakeDecimal(10),
        currency: "PEN",
        name: "Widget",
        variants: [],
      });
      prisma.order.create.mockResolvedValue({
        id: "order-1",
        totalAmount: new FakeDecimal(20),
        currency: "PEN",
        deliveryMethodType: "PICKUP",
        customerName: "Jane",
        customerPhone: dto.customerPhone,
      });
    });

    it("throws BadRequestException when the store has enabled points but none was selected", async () => {
      prisma.pickupPoint.count.mockResolvedValue(1);

      await expect(useCase.execute(slug, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("throws BadRequestException when the selected point belongs to a different store", async () => {
      prisma.pickupPoint.count.mockResolvedValue(1);
      prisma.pickupPoint.findUnique.mockResolvedValue({
        ...point,
        storeId: "other-store",
      });

      await expect(
        useCase.execute(slug, { ...dto, pickupPointId: point.id }),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException when the selected point is disabled", async () => {
      prisma.pickupPoint.count.mockResolvedValue(1);
      prisma.pickupPoint.findUnique.mockResolvedValue({
        ...point,
        enabled: false,
      });

      await expect(
        useCase.execute(slug, { ...dto, pickupPointId: point.id }),
      ).rejects.toThrow(BadRequestException);
    });

    it("succeeds with pickupPointId null when the store has zero configured points", async () => {
      prisma.pickupPoint.count.mockResolvedValue(0);

      await useCase.execute(slug, dto);

      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ pickupPointId: null }),
        }),
      );
    });

    it("snapshots the pickup point label into deliveryDetails and the whatsapp message", async () => {
      prisma.pickupPoint.count.mockResolvedValue(1);
      prisma.pickupPoint.findUnique.mockResolvedValue(point);

      const result = await useCase.execute(slug, {
        ...dto,
        pickupPointId: point.id,
      });

      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pickupPointId: point.id,
            deliveryDetails: expect.objectContaining({
              pickupPointLabel: point.label,
            }),
          }),
        }),
      );
      expect(result.whatsappUrl).toContain(encodeURIComponent(point.label));
    });
  });
});
