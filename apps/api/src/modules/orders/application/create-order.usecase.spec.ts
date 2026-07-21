import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { vi, type Mock } from 'vitest';
import { CreateOrderUseCase } from './create-order.usecase.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

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
    return new FakeDecimal(this.value + (n instanceof FakeDecimal ? n.value : n));
  }
  toNumber() {
    return this.value;
  }
}

describe('CreateOrderUseCase', () => {
  let useCase: CreateOrderUseCase;
  let prisma: {
    store: { findUnique: Mock };
    deliveryMethodConfig: { findUnique: Mock };
    $transaction: Mock;
    product: { findUnique: Mock };
    productVariant: { findUnique: Mock; update: Mock };
    order: { create: Mock };
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
      $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb(prisma)),
      product: { findUnique: vi.fn() },
      productVariant: { findUnique: vi.fn(), update: vi.fn() },
      order: { create: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [CreateOrderUseCase, { provide: PrismaService, useValue: prisma }],
    }).compile();

    useCase = module.get(CreateOrderUseCase);

    prisma.store.findUnique.mockResolvedValue(store);
    prisma.deliveryMethodConfig.findUnique.mockResolvedValue(deliveryConfig);
  });

  it('throws NotFoundException when the store does not exist', async () => {
    prisma.store.findUnique.mockResolvedValue(null);

    await expect(useCase.execute(slug, dto)).rejects.toThrow(NotFoundException);
  });

  it('throws BadRequestException when the delivery method is not configured', async () => {
    prisma.deliveryMethodConfig.findUnique.mockResolvedValue(null);

    await expect(useCase.execute(slug, dto)).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when the delivery method is disabled', async () => {
    prisma.deliveryMethodConfig.findUnique.mockResolvedValue({ ...deliveryConfig, enabled: false });

    await expect(useCase.execute(slug, dto)).rejects.toThrow(BadRequestException);
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
    });

    await expect(useCase.execute(slug, dto)).rejects.toThrow(BadRequestException);
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

    await expect(
      useCase.execute(slug, { ...dto, items: [{ ...dto.items[0], variantId: 'variant-1' }] }),
    ).rejects.toThrow(BadRequestException);
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

    const result = await useCase.execute(slug, {
      ...dto,
      items: [{ ...dto.items[0], variantId: 'variant-1' }],
    });

    expect(prisma.productVariant.update).toHaveBeenCalledWith({
      where: { id: 'variant-1' },
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
    expect(result.whatsappUrl).toContain('https://wa.me/51999999999');
    expect(result.whatsappUrl).toContain(encodeURIComponent('20.00 PEN'));
    expect(result.whatsappUrl).toContain(encodeURIComponent('Widget (Large)'));
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
      })
      .mockResolvedValueOnce({
        id: 'product-2',
        storeId: store.id,
        status: 'PUBLISHED',
        deletedAt: null,
        price: new FakeDecimal(10),
        currency: 'USD',
        name: 'Gadget',
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
    prisma.store.findUnique.mockResolvedValue({ ...store, whatsappNumber: null });
    prisma.product.findUnique.mockResolvedValue({
      id: 'product-1',
      storeId: store.id,
      status: 'PUBLISHED',
      deletedAt: null,
      price: new FakeDecimal(10),
      currency: 'PEN',
      name: 'Widget',
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
});
