import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { afterEach, type Mock, vi } from 'vitest';
import { CreateOrderUseCase } from './create-order.usecase.js';
import { PrismaService } from '../../../prisma/prisma.service.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { CustomerAccountService } from './customer-account.service.js';
import { getBusinessDate } from '../../../common/business-time.js';

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
  div(n: number) {
    return new FakeDecimal(this.value / n);
  }
  toNumber() {
    return this.value;
  }
  toString() {
    return String(this.value);
  }
  valueOf() {
    return this.value;
  }
}

describe('CreateOrderUseCase', () => {
  let useCase: CreateOrderUseCase;
  let prisma: {
    store: { findUnique: Mock };
    deliveryMethodConfig: { findUnique: Mock };
    pickupPoint: { count: Mock };
    courier: { findFirst: Mock };
    $transaction: Mock;
    $queryRaw: Mock;
    product: { findUnique: Mock };
    productVariant: { findUnique: Mock; update: Mock };
    order: { create: Mock };
    orderPayment: { create: Mock };
    whatsAppMessageTemplate: { findUnique: Mock };
  };
  let notifications: { syncStockAlerts: Mock; createIfNotOpen: Mock };
  let customerAccounts: {
    findOrCreateCustomer: Mock;
    sendVerificationEmail: Mock;
  };

  const slug = 'my-store';
  const store = {
    id: 'store-1',
    slug,
    name: 'My Store',
    holdWindowHours: 48,
    whatsappNumber: '+51999999999',
  };
  const deliveryConfig = {
    storeId: store.id,
    type: 'PICKUP',
    enabled: true,
    details: { estimatedCost: 0 },
  };

  const dto = {
    deliveryMethodType: 'PICKUP' as const,
    customerPhone: '+51988888888',
    customerName: 'Jane',
    items: [{ productId: 'product-1', quantity: 2 }],
  };

  beforeEach(async () => {
    prisma = {
      store: { findUnique: vi.fn() },
      deliveryMethodConfig: { findUnique: vi.fn() },
      pickupPoint: { count: vi.fn() },
      courier: { findFirst: vi.fn() },
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
      $queryRaw: vi.fn(),
      product: { findUnique: vi.fn() },
      productVariant: { findUnique: vi.fn(), update: vi.fn() },
      order: { create: vi.fn() },
      orderPayment: { create: vi.fn() },
      whatsAppMessageTemplate: { findUnique: vi.fn() },
    };
    notifications = { syncStockAlerts: vi.fn(), createIfNotOpen: vi.fn() };
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
    // No saved NEW_ORDER override by default — order messages use the
    // hardcoded default template (regression-checked in the custom-template
    // test below).
    prisma.whatsAppMessageTemplate.findUnique.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('throws NotFoundException when the store does not exist', async () => {
    prisma.store.findUnique.mockResolvedValue(null);

    await expect(useCase.execute(slug, dto)).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when the delivery method is not configured', async () => {
    prisma.deliveryMethodConfig.findUnique.mockResolvedValue(null);

    await expect(useCase.execute(slug, dto)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException when the delivery method is disabled', async () => {
    prisma.deliveryMethodConfig.findUnique.mockResolvedValue({
      ...deliveryConfig,
      enabled: false,
    });

    await expect(useCase.execute(slug, dto)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException for an unpublished product', async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: 'product-1',
      storeId: store.id,
      status: 'DRAFT',
      deletedAt: null,
      price: new FakeDecimal(10),
      currency: 'PEN',
      name: 'Widget',
      variants: [],
    });

    await expect(useCase.execute(slug, dto)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws BadRequestException when variant stock is insufficient', async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: 'product-1',
      storeId: store.id,
      status: 'PUBLISHED',
      deletedAt: null,
      price: new FakeDecimal(10),
      currency: 'PEN',
      name: 'Widget',
    });
    prisma.productVariant.findUnique.mockResolvedValue({
      id: 'variant-1',
      productId: 'product-1',
      name: 'Large',
      stock: 1,
      reserved: 0,
      priceOverride: null,
    });
    // Simulates the atomic conditional UPDATE's WHERE clause excluding the
    // row (insufficient stock) — the real DB would return zero rows here.
    prisma.$queryRaw.mockResolvedValue([]);

    await expect(
      useCase.execute(slug, {
        ...dto,
        items: [{ ...dto.items[0], variantId: 'variant-1' }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException for a multi-variant product when no variant was selected', async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: 'product-1',
      storeId: store.id,
      status: 'PUBLISHED',
      deletedAt: null,
      price: new FakeDecimal(10),
      currency: 'PEN',
      name: 'Widget',
      variants: [{ id: 'variant-1', name: 'Large', stock: 5, reserved: 0 }],
    });

    await expect(useCase.execute(slug, dto)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('reserves stock, computes the total, and creates the order', async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: 'product-1',
      storeId: store.id,
      status: 'PUBLISHED',
      deletedAt: null,
      price: new FakeDecimal(10),
      currency: 'PEN',
      name: 'Widget',
    });
    prisma.productVariant.findUnique.mockResolvedValue({
      id: 'variant-1',
      productId: 'product-1',
      name: 'Large',
      stock: 5,
      reserved: 0,
      priceOverride: null,
    });
    prisma.order.create.mockResolvedValue({
      id: 'order-1',
      totalAmount: new FakeDecimal(20),
      currency: 'PEN',
      deliveryMethodType: 'PICKUP',
      customerName: 'Jane',
      customerPhone: dto.customerPhone,
    });
    // Simulates the atomic conditional UPDATE ... RETURNING * succeeding.
    prisma.$queryRaw.mockResolvedValue([
      {
        id: 'variant-1',
        productId: 'product-1',
        name: 'Large',
        stock: 5,
        reserved: 2,
      },
    ]);

    const result = await useCase.execute(slug, {
      ...dto,
      items: [{ ...dto.items[0], variantId: 'variant-1' }],
    });

    expect(prisma.$queryRaw).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.stringContaining('UPDATE "ProductVariant"'),
        expect.stringContaining('"Product"."storeId"'),
      ]),
      2,
      'variant-1',
      store.id,
      2,
    );
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
    expect(result.whatsappUrl).toContain('https://wa.me/51999999999');
    expect(result.whatsappUrl).toContain(encodeURIComponent('20.00 PEN'));
    expect(result.whatsappUrl).toContain(encodeURIComponent('Widget (Large)'));
    expect(notifications.syncStockAlerts).toHaveBeenCalledWith(
      prisma,
      store,
      expect.objectContaining({ id: 'product-1' }),
      expect.objectContaining({ id: 'variant-1' }),
    );
  });

  it('attaches a BUYER_SUBMITTED/PENDING_REVIEW payment for the order total when a proof is uploaded', async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: 'product-1',
      storeId: store.id,
      status: 'PUBLISHED',
      deletedAt: null,
      price: new FakeDecimal(10),
      currency: 'PEN',
      name: 'Widget',
      variants: [],
    });
    prisma.order.create.mockResolvedValue({
      id: 'order-1',
      totalAmount: new FakeDecimal(20),
      currency: 'PEN',
      deliveryMethodType: 'PICKUP',
      customerName: 'Jane',
      customerPhone: dto.customerPhone,
    });

    await useCase.execute(
      slug,
      { ...dto, paymentMethod: 'YAPE' },
      { imageUrl: 'https://minio/payments/proof.jpg' },
    );

    expect(prisma.orderPayment.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        orderId: 'order-1',
        storeId: store.id,
        amount: expect.any(FakeDecimal),
        currency: 'PEN',
        method: 'YAPE',
        imageUrl: 'https://minio/payments/proof.jpg',
        source: 'BUYER_SUBMITTED',
        reviewStatus: 'PENDING_REVIEW',
      }),
    });
    // The seller notification fires inside the same transaction (tx === prisma
    // under the mocked $transaction), with the same dedup helper the buyer
    // account's submit-proof endpoint uses.
    expect(notifications.createIfNotOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'PAYMENT_PROOF_SUBMITTED',
        entityId: 'order-1',
      }),
      prisma,
    );
  });

  it('does not create a payment row when no proof was uploaded', async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: 'product-1',
      storeId: store.id,
      status: 'PUBLISHED',
      deletedAt: null,
      price: new FakeDecimal(10),
      currency: 'PEN',
      name: 'Widget',
      variants: [],
    });
    prisma.order.create.mockResolvedValue({
      id: 'order-1',
      totalAmount: new FakeDecimal(20),
      currency: 'PEN',
      deliveryMethodType: 'PICKUP',
      customerName: 'Jane',
      customerPhone: dto.customerPhone,
    });

    await useCase.execute(slug, dto);

    expect(prisma.orderPayment.create).not.toHaveBeenCalled();
    expect(notifications.createIfNotOpen).not.toHaveBeenCalled();
  });

  it('snapshots the submitted shippingAddress into deliveryDetails for a COURIER order', async () => {
    prisma.deliveryMethodConfig.findUnique.mockResolvedValue({
      ...deliveryConfig,
      type: 'COURIER',
      details: { estimatedCost: 15 },
    });
    // The use case now reads the courier config inside the tx via $queryRaw
    // with FOR UPDATE. Mock $queryRaw to return the courier config row when
    // the query string includes "CourierConfig".
    prisma.$queryRaw.mockImplementation(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join('');
        if (sql.includes('"CourierConfig"')) {
          return [
            {
              id: 'config-1',
              courierId: 'courier-1',
              modality: 'HOME',
              price: new FakeDecimal(12),
              enabled: true,
            },
          ];
        }
        return [];
      },
    );
    prisma.product.findUnique.mockResolvedValue({
      id: 'product-1',
      storeId: store.id,
      status: 'PUBLISHED',
      deletedAt: null,
      price: new FakeDecimal(10),
      currency: 'PEN',
      name: 'Widget',
      variants: [],
    });
    prisma.order.create.mockResolvedValue({
      id: 'order-1',
      totalAmount: new FakeDecimal(35),
      currency: 'PEN',
      deliveryMethodType: 'COURIER',
      customerName: 'Jane',
      customerPhone: dto.customerPhone,
    });

    const shippingAddress = {
      recipientName: 'Jane Doe',
      phone: '+51988888888',
      line1: 'Av. Principal 123',
      city: 'Lima',
    };

    await useCase.execute(slug, {
      ...dto,
      deliveryMethodType: 'COURIER',
      courierName: 'Olva',
      courierModality: 'HOME',
      shippingAddress,
    });

    expect(prisma.order.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deliveryDetails: expect.objectContaining({
            courierName: 'Olva',
            courierModality: 'HOME',
            deliveryCost: 12,
            shippingAddress,
          }),
        }),
      }),
    );
  });

  it('rejects a cart mixing products with different currencies', async () => {
    prisma.product.findUnique
      .mockResolvedValueOnce({
        id: 'product-1',
        storeId: store.id,
        status: 'PUBLISHED',
        deletedAt: null,
        price: new FakeDecimal(10),
        currency: 'PEN',
        name: 'Widget',
        variants: [],
      })
      .mockResolvedValueOnce({
        id: 'product-2',
        storeId: store.id,
        status: 'PUBLISHED',
        deletedAt: null,
        price: new FakeDecimal(10),
        currency: 'USD',
        name: 'Gadget',
        variants: [],
      });

    await expect(
      useCase.execute(slug, {
        ...dto,
        items: [
          { productId: 'product-1', quantity: 1 },
          { productId: 'product-2', quantity: 1 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('does not build a whatsapp url when the store has no whatsappNumber configured', async () => {
    prisma.store.findUnique.mockResolvedValue({
      ...store,
      whatsappNumber: null,
    });
    prisma.product.findUnique.mockResolvedValue({
      id: 'product-1',
      storeId: store.id,
      status: 'PUBLISHED',
      deletedAt: null,
      price: new FakeDecimal(10),
      currency: 'PEN',
      name: 'Widget',
      variants: [],
    });
    prisma.order.create.mockResolvedValue({
      id: 'order-1',
      totalAmount: new FakeDecimal(20),
      currency: 'PEN',
      deliveryMethodType: 'PICKUP',
      customerName: 'Jane',
      customerPhone: dto.customerPhone,
    });

    const result = await useCase.execute(slug, dto);

    expect(result.whatsappUrl).toBeNull();
  });

  it("renders the store's saved NEW_ORDER template instead of the default", async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: 'product-1',
      storeId: store.id,
      status: 'PUBLISHED',
      deletedAt: null,
      price: new FakeDecimal(10),
      currency: 'PEN',
      name: 'Widget',
      variants: [],
    });
    prisma.order.create.mockResolvedValue({
      id: 'order-123456',
      totalAmount: new FakeDecimal(20),
      currency: 'PEN',
      deliveryMethodType: 'PICKUP',
      customerName: 'Jane',
      customerPhone: dto.customerPhone,
    });
    prisma.whatsAppMessageTemplate.findUnique.mockResolvedValue({
      id: 'tmpl-1',
      storeId: store.id,
      type: 'NEW_ORDER',
      template: '*Pedido {{orderRef}}* en {{storeName}}\n{{items}}',
      updatedAt: new Date('2026-08-09T12:00:00.000Z'),
    });

    const result = await useCase.execute(slug, dto);

    expect(prisma.whatsAppMessageTemplate.findUnique).toHaveBeenCalledWith({
      where: {
        storeId_type: { storeId: store.id, type: 'NEW_ORDER' },
      },
    });
    expect(result.whatsappUrl).toContain(
      encodeURIComponent('*Pedido #123456* en My Store'),
    );
    expect(result.whatsappUrl).toContain(
      encodeURIComponent('2x Widget - 10.00 PEN c/u'),
    );
    // The default-message marker must not appear when a custom template is set.
    expect(result.whatsappUrl).not.toContain(
      encodeURIComponent('Nuevo pedido en My Store'),
    );
  });

  it("still sends today's exact default message when the store has no NEW_ORDER override", async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: 'product-1',
      storeId: store.id,
      status: 'PUBLISHED',
      deletedAt: null,
      price: new FakeDecimal(10),
      currency: 'PEN',
      name: 'Widget',
      variants: [],
    });
    prisma.order.create.mockResolvedValue({
      id: 'order-123456',
      totalAmount: new FakeDecimal(20),
      currency: 'PEN',
      deliveryMethodType: 'PICKUP',
      customerName: 'Jane',
      customerPhone: dto.customerPhone,
    });

    const result = await useCase.execute(slug, dto);

    expect(result.whatsappUrl).toContain(
      encodeURIComponent('*Nuevo pedido en My Store*'),
    );
    expect(result.whatsappUrl).toContain(encodeURIComponent('Ref: #123456'));
  });

  describe('customer accounts', () => {
    beforeEach(() => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'product-1',
        storeId: store.id,
        status: 'PUBLISHED',
        deletedAt: null,
        price: new FakeDecimal(10),
        currency: 'PEN',
        name: 'Widget',
        variants: [],
      });
      prisma.order.create.mockResolvedValue({
        id: 'order-1',
        totalAmount: new FakeDecimal(20),
        currency: 'PEN',
        deliveryMethodType: 'PICKUP',
        customerName: 'Jane',
        customerPhone: dto.customerPhone,
      });
    });

    it('does not touch customer accounts when no email was provided', async () => {
      await useCase.execute(slug, dto);

      expect(customerAccounts.findOrCreateCustomer).not.toHaveBeenCalled();
      expect(customerAccounts.sendVerificationEmail).not.toHaveBeenCalled();
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerId: undefined,
            buyerAccountId: undefined,
          }),
        }),
      );
    });

    it('links the order to the buyer account and sends a verification email for a new/unverified account', async () => {
      const customer = {
        id: 'customer-1',
        storeId: store.id,
        email: 'jane@example.com',
      };
      const buyerAccount = { id: 'buyer-1', email: 'jane@example.com' };
      customerAccounts.findOrCreateCustomer.mockResolvedValue({
        customer,
        buyerAccount,
        needsVerificationEmail: true,
      });

      await useCase.execute(slug, {
        ...dto,
        customerEmail: 'jane@example.com',
      });

      expect(customerAccounts.findOrCreateCustomer).toHaveBeenCalledWith(
        prisma,
        store.id,
        dto.customerPhone,
        'jane@example.com',
        dto.customerName,
      );
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerId: 'customer-1',
            buyerAccountId: 'buyer-1',
          }),
        }),
      );
      expect(customerAccounts.sendVerificationEmail).toHaveBeenCalledWith(
        buyerAccount,
        store,
      );
    });

    it('skips the verification email for an already-verified repeat customer', async () => {
      const customer = {
        id: 'customer-1',
        storeId: store.id,
        email: 'jane@example.com',
      };
      const buyerAccount = { id: 'buyer-1', email: 'jane@example.com' };
      customerAccounts.findOrCreateCustomer.mockResolvedValue({
        customer,
        buyerAccount,
        needsVerificationEmail: false,
      });

      await useCase.execute(slug, {
        ...dto,
        customerEmail: 'jane@example.com',
      });

      expect(customerAccounts.sendVerificationEmail).not.toHaveBeenCalled();
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerId: customer.id,
            buyerAccountId: buyerAccount.id,
          }),
        }),
      );
    });

    it('does not link the order to a customer when the mismatch guard returns null', async () => {
      customerAccounts.findOrCreateCustomer.mockResolvedValue({
        customer: null,
        buyerAccount: null,
        needsVerificationEmail: false,
      });

      await useCase.execute(slug, {
        ...dto,
        customerEmail: 'attacker@example.com',
      });

      expect(customerAccounts.sendVerificationEmail).not.toHaveBeenCalled();
      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            customerId: undefined,
            buyerAccountId: undefined,
          }),
        }),
      );
    });
  });

  describe('pickup points', () => {
    const point = {
      id: 'point-1',
      storeId: store.id,
      label: 'Alameda 28 de Julio',
      enabled: true,
      openDays: [] as number[],
      closedOverride: false,
    };

    beforeEach(() => {
      prisma.product.findUnique.mockResolvedValue({
        id: 'product-1',
        storeId: store.id,
        status: 'PUBLISHED',
        deletedAt: null,
        price: new FakeDecimal(10),
        currency: 'PEN',
        name: 'Widget',
        variants: [],
      });
      prisma.order.create.mockResolvedValue({
        id: 'order-1',
        totalAmount: new FakeDecimal(20),
        currency: 'PEN',
        deliveryMethodType: 'PICKUP',
        customerName: 'Jane',
        customerPhone: dto.customerPhone,
      });
    });

    it('throws BadRequestException when the store has enabled points but none was selected', async () => {
      prisma.pickupPoint.count.mockResolvedValue(1);

      await expect(useCase.execute(slug, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException when the selected point belongs to a different store', async () => {
      prisma.pickupPoint.count.mockResolvedValue(1);
      prisma.$queryRaw.mockResolvedValue([
        { ...point, storeId: 'other-store' },
      ]);

      await expect(
        useCase.execute(slug, { ...dto, pickupPointId: point.id }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the selected point is disabled', async () => {
      prisma.pickupPoint.count.mockResolvedValue(1);
      prisma.$queryRaw.mockResolvedValue([{ ...point, enabled: false }]);

      await expect(
        useCase.execute(slug, { ...dto, pickupPointId: point.id }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when the selected point has closedOverride set', async () => {
      prisma.pickupPoint.count.mockResolvedValue(1);
      prisma.$queryRaw.mockResolvedValue([{ ...point, closedOverride: true }]);

      await expect(
        useCase.execute(slug, { ...dto, pickupPointId: point.id }),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException when today is not in the point's openDays", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-05T12:00:00Z'));
      prisma.pickupPoint.count.mockResolvedValue(1);
      const closedToday = [0, 1, 2, 3, 4, 5, 6].filter(
        (day) => day !== getBusinessDate().weekday,
      );
      prisma.$queryRaw.mockResolvedValue([{ ...point, openDays: closedToday }]);

      await expect(
        useCase.execute(slug, { ...dto, pickupPointId: point.id }),
      ).rejects.toThrow(BadRequestException);
    });

    it("succeeds when today is in the point's openDays", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-05T12:00:00Z'));
      prisma.pickupPoint.count.mockResolvedValue(1);
      prisma.$queryRaw.mockResolvedValue([
        { ...point, openDays: [getBusinessDate().weekday] },
      ]);

      await expect(
        useCase.execute(slug, { ...dto, pickupPointId: point.id }),
      ).resolves.toBeDefined();
    });

    it('succeeds with pickupPointId null when the store has zero configured points', async () => {
      prisma.pickupPoint.count.mockResolvedValue(0);

      await useCase.execute(slug, dto);

      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ pickupPointId: null }),
        }),
      );
    });

    it('throws BadRequestException when no pickupDate is submitted for a point closed today with a schedule', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-05T12:00:00Z'));
      prisma.pickupPoint.count.mockResolvedValue(1);
      const closedToday = [0, 1, 2, 3, 4, 5, 6].filter(
        (day) => day !== getBusinessDate().weekday,
      );
      prisma.$queryRaw.mockResolvedValue([{ ...point, openDays: closedToday }]);

      await expect(
        useCase.execute(slug, { ...dto, pickupPointId: point.id }),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException when the submitted pickupDate's weekday isn't in openDays", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-05T12:00:00Z')); // Wednesday
      prisma.pickupPoint.count.mockResolvedValue(1);
      prisma.$queryRaw.mockResolvedValue([
        { ...point, openDays: [5] }, // only open Fridays
      ]);

      await expect(
        useCase.execute(slug, {
          ...dto,
          pickupPointId: point.id,
          pickupDate: '2026-08-06', // Thursday, not Friday
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it("throws BadRequestException for any pickupDate against a closedOverride'd point", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-05T12:00:00Z'));
      prisma.pickupPoint.count.mockResolvedValue(1);
      prisma.$queryRaw.mockResolvedValue([
        { ...point, closedOverride: true, openDays: [3] },
      ]);

      await expect(
        useCase.execute(slug, {
          ...dto,
          pickupPointId: point.id,
          pickupDate: '2026-08-05',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts a valid future pickupDate whose weekday is in openDays', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-05T12:00:00Z')); // Wednesday
      prisma.pickupPoint.count.mockResolvedValue(1);
      prisma.$queryRaw.mockResolvedValue([
        { ...point, openDays: [5] }, // Friday
      ]);

      const result = await useCase.execute(slug, {
        ...dto,
        pickupPointId: point.id,
        pickupDate: '2026-08-07', // Friday
      });

      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pickupDate: new Date('2026-08-07T00:00:00Z'),
          }),
        }),
      );
      expect(result).toBeDefined();
    });

    it('regression: a same-day-open point still works with no pickupDate at all', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-05T12:00:00Z'));
      prisma.pickupPoint.count.mockResolvedValue(1);
      prisma.$queryRaw.mockResolvedValue([
        { ...point, openDays: [getBusinessDate().weekday] },
      ]);

      await useCase.execute(slug, { ...dto, pickupPointId: point.id });

      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ pickupDate: null }),
        }),
      );
    });

    it('snapshots the pickup point label into deliveryDetails and the whatsapp message', async () => {
      prisma.pickupPoint.count.mockResolvedValue(1);
      prisma.$queryRaw.mockResolvedValue([point]);

      const result = await useCase.execute(slug, {
        ...dto,
        pickupPointId: point.id,
      });

      // Validates the locked lookup (SELECT ... FOR UPDATE) inside the
      // order-creation transaction, not a pre-transaction read.
      expect(prisma.$queryRaw).toHaveBeenCalledWith(
        expect.arrayContaining([expect.stringContaining('FOR UPDATE')]),
        point.id,
      );
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

    it('rejects a pickupDate on a COURIER order (no pickup point to schedule)', async () => {
      prisma.pickupPoint.count.mockResolvedValue(0);
      prisma.deliveryMethodConfig.findUnique.mockResolvedValue({
        ...deliveryConfig,
        type: 'COURIER',
      });

      await expect(
        useCase.execute(slug, {
          ...dto,
          deliveryMethodType: 'COURIER',
          pickupDate: '2026-08-20',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a pickupDate when the store has no enabled points', async () => {
      prisma.pickupPoint.count.mockResolvedValue(0);

      await expect(
        useCase.execute(slug, { ...dto, pickupDate: '2026-08-20' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a calendar-invalid pickupDate that JS Date would normalize (2026-02-30)', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-05T12:00:00Z'));
      prisma.pickupPoint.count.mockResolvedValue(1);
      // Open every day except via closedOverride — the point itself is
      // irrelevant here, the date must be rejected before weekday checks.
      prisma.$queryRaw.mockResolvedValue([
        {
          ...point,
          openDays: [0, 1, 2, 3, 4, 5, 6],
        },
      ]);

      await expect(
        useCase.execute(slug, {
          ...dto,
          pickupPointId: point.id,
          pickupDate: '2026-02-30', // normalizes to 2026-03-02 if unchecked
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a pickupDate that is today', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-05T12:00:00Z'));
      prisma.pickupPoint.count.mockResolvedValue(1);
      // Point is open today — only the "strictly after today" check can
      // reject this, isolating it from the closed-today path.
      prisma.$queryRaw.mockResolvedValue([
        { ...point, openDays: [getBusinessDate().weekday] },
      ]);

      await expect(
        useCase.execute(slug, {
          ...dto,
          pickupPointId: point.id,
          pickupDate: getBusinessDate().isoDate,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects a past pickupDate whose weekday is in openDays', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-05T12:00:00Z')); // Wednesday
      prisma.pickupPoint.count.mockResolvedValue(1);
      prisma.$queryRaw.mockResolvedValue([
        { ...point, openDays: [3] }, // open Wednesdays — 2026-07-29 is one
      ]);

      await expect(
        useCase.execute(slug, {
          ...dto,
          pickupPointId: point.id,
          pickupDate: '2026-07-29', // a Wednesday, but a week in the past
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('accepts and persists a valid future pickupDate when the point is open today', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-05T12:00:00Z')); // Wednesday
      prisma.pickupPoint.count.mockResolvedValue(1);
      // Open Wednesdays and Fridays — today is one of them, but the buyer
      // may still schedule ahead for a future open day.
      prisma.$queryRaw.mockResolvedValue([{ ...point, openDays: [3, 5] }]);

      const result = await useCase.execute(slug, {
        ...dto,
        pickupPointId: point.id,
        pickupDate: '2026-08-07', // Friday
      });

      expect(prisma.order.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            pickupDate: new Date('2026-08-07T00:00:00Z'),
          }),
        }),
      );
      expect(result).toBeDefined();
    });

    it('rejects an invalid pickupDate even when the point is open today', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-05T12:00:00Z')); // Wednesday
      prisma.pickupPoint.count.mockResolvedValue(1);
      // Open today AND on Fridays — a Thursday date fails the weekday check
      // even though the point isn't closed today.
      prisma.$queryRaw.mockResolvedValue([{ ...point, openDays: [3, 5] }]);

      await expect(
        useCase.execute(slug, {
          ...dto,
          pickupPointId: point.id,
          pickupDate: '2026-08-06', // Thursday
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('uses the business timezone (America/Lima) for the today/weekday check', async () => {
      prisma.pickupPoint.count.mockResolvedValue(1);

      // 2026-08-06 04:59 UTC is still 2026-08-05 23:59 in Lima (Wednesday) —
      // a point open only on Wednesdays is OPEN today here.
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-08-06T04:59:00Z'));
      prisma.$queryRaw.mockResolvedValue([{ ...point, openDays: [3] }]);
      await expect(
        useCase.execute(slug, { ...dto, pickupPointId: point.id }),
      ).resolves.toBeDefined();

      // One minute later it's 2026-08-06 00:01 in Lima (Thursday) — the same
      // point is now closed today and requires a pickupDate. UTC getDay()
      // would have said Wednesday for both instants.
      vi.setSystemTime(new Date('2026-08-06T05:01:00Z'));
      await expect(
        useCase.execute(slug, { ...dto, pickupPointId: point.id }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
