import { Test, type TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { type Mock, vi } from 'vitest';
import { ProductsService } from './products.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: {
    store: { findUnique: Mock };
    product: {
      findUnique: Mock;
      findUniqueOrThrow: Mock;
      findMany: Mock;
      create: Mock;
      update: Mock;
    };
    productVariant: {
      create: Mock;
      findMany: Mock;
      findUnique: Mock;
      update: Mock;
      delete: Mock;
    };
    productCategory: { createMany: Mock; deleteMany: Mock };
    category: { count: Mock };
    orderItem: { groupBy: Mock; aggregate: Mock; count: Mock };
    $transaction: Mock;
  };

  const ownerId = 'user-1';
  const storeId = 'store-1';
  const productId = 'product-1';

  beforeEach(async () => {
    prisma = {
      store: { findUnique: vi.fn() },
      product: {
        findUnique: vi.fn(),
        findUniqueOrThrow: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      productVariant: {
        create: vi.fn(),
        findMany: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      productCategory: { createMany: vi.fn(), deleteMany: vi.fn() },
      category: { count: vi.fn() },
      orderItem: { groupBy: vi.fn(), aggregate: vi.fn(), count: vi.fn() },
      $transaction: vi.fn((cb) => cb(prisma)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: NotificationsService,
          useValue: { syncStockAlerts: vi.fn() },
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
  });

  describe('ownership checks', () => {
    it('throws NotFoundException when the store does not exist', async () => {
      prisma.store.findUnique.mockResolvedValue(null);

      await expect(service.findAllForStore(storeId, ownerId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when the user does not own the store', async () => {
      prisma.store.findUnique.mockResolvedValue({
        id: storeId,
        ownerId: 'someone-else',
      });

      await expect(service.findAllForStore(storeId, ownerId)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('findOwnedProduct (via update)', () => {
    beforeEach(() => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
    });

    it('throws NotFoundException when the product does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(
        service.update(productId, storeId, ownerId, {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the product belongs to a different store', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: productId,
        storeId: 'other-store',
      });

      await expect(
        service.update(productId, storeId, ownerId, {}),
      ).rejects.toThrow(NotFoundException);
    });
  });

  it('create() creates the product scoped to the store after ownership passes', async () => {
    prisma.store.findUnique.mockResolvedValue({
      id: storeId,
      ownerId,
      defaultCurrency: 'PEN',
    });
    prisma.product.create.mockResolvedValue({ id: productId });
    const dto = { name: 'Widget', price: 10 };

    await service.create(storeId, ownerId, dto);

    expect(prisma.product.create).toHaveBeenCalledWith({
      data: { ...dto, storeId, currency: 'PEN' },
    });
  });

  it('create() creates a default variant when stock is provided', async () => {
    prisma.store.findUnique.mockResolvedValue({
      id: storeId,
      ownerId,
      defaultCurrency: 'PEN',
    });
    prisma.product.create.mockResolvedValue({ id: productId });
    const dto = { name: 'Widget', price: 10, stock: 12 };

    await service.create(storeId, ownerId, dto);

    expect(prisma.product.create).toHaveBeenCalledWith({
      data: { name: 'Widget', price: 10, storeId, currency: 'PEN' },
    });
    expect(prisma.productVariant.create).toHaveBeenCalledWith({
      data: {
        productId,
        storeId,
        name: 'Default',
        stock: 12,
      },
    });
  });

  it('create() creates multiple variants when variants are provided', async () => {
    prisma.store.findUnique.mockResolvedValue({
      id: storeId,
      ownerId,
      defaultCurrency: 'PEN',
    });
    prisma.product.create.mockResolvedValue({ id: productId });
    const dto = {
      name: 'Widget',
      price: 10,
      variants: [
        { name: 'Red / S', stock: 3, attributes: { Color: 'Red', Size: 'S' } },
        {
          name: 'Blue / M',
          stock: 2,
          attributes: { Color: 'Blue', Size: 'M' },
        },
      ],
    };

    await service.create(storeId, ownerId, dto);

    expect(prisma.productVariant.create).toHaveBeenCalledTimes(2);
    expect(prisma.productVariant.create).toHaveBeenNthCalledWith(1, {
      data: {
        name: 'Red / S',
        stock: 3,
        attributes: { Color: 'Red', Size: 'S' },
        productId,
        storeId,
      },
    });
    expect(prisma.productVariant.create).toHaveBeenNthCalledWith(2, {
      data: {
        name: 'Blue / M',
        stock: 2,
        attributes: { Color: 'Blue', Size: 'M' },
        productId,
        storeId,
      },
    });
  });

  it("create() uses the dto's currency instead of the store default when provided", async () => {
    prisma.store.findUnique.mockResolvedValue({
      id: storeId,
      ownerId,
      defaultCurrency: 'PEN',
    });
    prisma.product.create.mockResolvedValue({ id: productId });
    const dto = { name: 'Widget', price: 10, currency: 'USD' };

    await service.create(storeId, ownerId, dto);

    expect(prisma.product.create).toHaveBeenCalledWith({
      data: { ...dto, storeId, currency: 'USD' },
    });
  });

  it('create() returns the product with its created variants included', async () => {
    prisma.store.findUnique.mockResolvedValue({
      id: storeId,
      ownerId,
      defaultCurrency: 'PEN',
    });
    prisma.product.create.mockResolvedValue({ id: productId });
    const created = {
      id: productId,
      variants: [{ id: 'v1', name: 'Red / S' }],
    };
    prisma.product.findUniqueOrThrow.mockResolvedValue(created);
    const dto = {
      name: 'Widget',
      price: 10,
      variants: [
        {
          name: 'Red / S',
          stock: 3,
          attributes: { Color: 'Red', Size: 'S' },
        },
      ],
    };

    const result = await service.create(storeId, ownerId, dto);

    expect(prisma.product.findUniqueOrThrow).toHaveBeenCalledWith({
      where: { id: productId },
      include: { variants: true },
    });
    expect(result).toBe(created);
  });

  it('findAllForStore() filters out soft-deleted products and includes variants', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
    prisma.product.findMany.mockResolvedValue([]);
    prisma.orderItem.groupBy.mockResolvedValue([]);

    await service.findAllForStore(storeId, ownerId);

    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: { storeId, deletedAt: null },
      include: { variants: true, categories: { include: { category: true } } },
    });
  });

  it('findAllForStore() returns soldUnits and availableStock', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
    prisma.product.findMany.mockResolvedValue([
      {
        id: productId,
        variants: [{ id: 'v1', stock: 12, reserved: 2 }],
        categories: [],
      },
    ]);
    prisma.orderItem.groupBy.mockResolvedValue([
      { productId, _sum: { quantity: 4 } },
    ]);

    const result = await service.findAllForStore(storeId, ownerId);

    expect(result).toEqual([
      {
        id: productId,
        variants: [{ id: 'v1', stock: 12, reserved: 2 }],
        categories: [],
        soldUnits: 4,
        availableStock: 10,
      },
    ]);
  });

  it('findOne() returns product details with soldUnits and availableStock', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
    prisma.product.findUnique.mockResolvedValue({
      id: productId,
      storeId,
      deletedAt: null,
      variants: [{ id: 'v1', stock: 12, reserved: 2 }],
      categories: [],
    });
    prisma.orderItem.aggregate.mockResolvedValue({ _sum: { quantity: 4 } });

    const result = await service.findOne(storeId, productId, ownerId);

    expect(prisma.product.findUnique).toHaveBeenCalledWith({
      where: { id: productId },
      include: { variants: true, categories: { include: { category: true } } },
    });
    expect(result).toEqual({
      id: productId,
      storeId,
      deletedAt: null,
      variants: [{ id: 'v1', stock: 12, reserved: 2 }],
      categories: [],
      soldUnits: 4,
      availableStock: 10,
    });
  });

  it('publish() sets the product status to PUBLISHED', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
    prisma.product.findUnique.mockResolvedValue({ id: productId, storeId });
    prisma.product.update.mockResolvedValue({});

    await service.publish(productId, storeId, ownerId);

    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: productId },
      data: { status: 'PUBLISHED' },
    });
  });

  it('softDelete() sets deletedAt and forces status back to DRAFT', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
    prisma.product.findUnique.mockResolvedValue({ id: productId, storeId });
    prisma.product.update.mockResolvedValue({});

    await service.softDelete(productId, storeId, ownerId);

    const expectedData: {
      deletedAt: Date;
      status: string;
      discontinued: boolean;
    } = {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() is untyped in Jest's matcher API
      deletedAt: expect.any(Date),
      status: 'DRAFT',
      discontinued: false,
    };
    expect(prisma.product.update).toHaveBeenCalledWith({
      where: { id: productId },
      data: expectedData,
    });
  });

  it('addVariant() creates a variant scoped to the owned product', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
    prisma.product.findUnique.mockResolvedValue({ id: productId, storeId });
    prisma.productVariant.create.mockResolvedValue({});
    const dto = { name: 'Large' };

    await service.addVariant(productId, storeId, ownerId, dto);

    expect(prisma.productVariant.create).toHaveBeenCalledWith({
      data: { ...dto, productId, storeId },
    });
  });

  it('listVariants() lists variants for the owned product', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
    prisma.product.findUnique.mockResolvedValue({ id: productId, storeId });
    prisma.productVariant.findMany.mockResolvedValue([]);

    await service.listVariants(productId, storeId, ownerId);

    expect(prisma.productVariant.findMany).toHaveBeenCalledWith({
      where: { productId },
    });
  });
  it('updateVariant() updates a variant scoped to the owned product', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
    prisma.product.findUnique.mockResolvedValue({ id: productId, storeId });
    prisma.productVariant.findUnique.mockResolvedValue({
      id: 'v1',
      productId,
      storeId,
    });
    prisma.productVariant.update.mockResolvedValue({});

    await service.updateVariant(productId, 'v1', storeId, ownerId, {
      stock: 5,
    });

    expect(prisma.productVariant.update).toHaveBeenCalledWith({
      where: { id: 'v1' },
      data: { stock: 5 },
    });
  });

  it('deleteVariant() throws when variant has order items', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
    prisma.product.findUnique.mockResolvedValue({ id: productId, storeId });
    prisma.productVariant.findUnique.mockResolvedValue({
      id: 'v1',
      productId,
      storeId,
    });
    prisma.orderItem.count.mockResolvedValue(1);

    await expect(
      service.deleteVariant(productId, 'v1', storeId, ownerId),
    ).rejects.toThrow(BadRequestException);
  });

  describe('addImage', () => {
    beforeEach(() => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
    });

    it('appends a new image to the array', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: productId,
        storeId,
        images: ['a.png'],
      });
      prisma.product.update.mockResolvedValue({});

      await service.addImage(productId, storeId, ownerId, 'b.png');

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: productId },
        data: { images: ['a.png', 'b.png'] },
      });
    });

    it('replaces the first image when replace is true', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: productId,
        storeId,
        images: ['old.png', '2.png'],
      });
      prisma.product.update.mockResolvedValue({});

      await service.addImage(productId, storeId, ownerId, 'new.png', true);

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: productId },
        data: { images: ['new.png', '2.png'] },
      });
    });

    it('throws BadRequestException when max images reached without replace', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: productId,
        storeId,
        images: ['1.png', '2.png', '3.png', '4.png', '5.png', '6.png'],
      });

      await expect(
        service.addImage(productId, storeId, ownerId, '7.png'),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('removeImage', () => {
    beforeEach(() => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
    });

    it('removes the image at the given index and returns the removed URL', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: productId,
        storeId,
        images: ['a.png', 'b.png', 'c.png'],
      });
      prisma.product.update.mockResolvedValue({});

      const result = await service.removeImage(productId, storeId, ownerId, 1);

      expect(result).toEqual({ removed: 'b.png' });
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: productId },
        data: { images: ['a.png', 'c.png'] },
      });
    });

    it('throws BadRequestException for out-of-range index', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: productId,
        storeId,
        images: ['a.png'],
      });

      await expect(
        service.removeImage(productId, storeId, ownerId, 5),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for negative index', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: productId,
        storeId,
        images: ['a.png'],
      });

      await expect(
        service.removeImage(productId, storeId, ownerId, -1),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('reorderImages', () => {
    beforeEach(() => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
    });

    it('replaces the images array with the new order', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: productId,
        storeId,
        images: ['a.png', 'b.png', 'c.png'],
      });
      prisma.product.update.mockResolvedValue({});

      await service.reorderImages(productId, storeId, ownerId, [
        'c.png',
        'a.png',
        'b.png',
      ]);

      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: productId },
        data: { images: ['c.png', 'a.png', 'b.png'] },
      });
    });

    it('throws BadRequestException when URLs are not in the current set', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: productId,
        storeId,
        images: ['a.png'],
      });

      await expect(
        service.reorderImages(productId, storeId, ownerId, [
          'a.png',
          'foreign.png',
        ]),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when more images than max', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: productId,
        storeId,
        images: [],
      });

      await expect(
        service.reorderImages(productId, storeId, ownerId, [
          '1.png',
          '2.png',
          '3.png',
          '4.png',
          '5.png',
          '6.png',
          '7.png',
        ]),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('clearImages', () => {
    beforeEach(() => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
    });

    it('empties the images array and returns removed URLs', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: productId,
        storeId,
        images: ['a.png', 'b.png'],
      });
      prisma.product.update.mockResolvedValue({});

      const result = await service.clearImages(productId, storeId, ownerId);

      expect(result).toEqual({ removed: ['a.png', 'b.png'] });
      expect(prisma.product.update).toHaveBeenCalledWith({
        where: { id: productId },
        data: { images: [] },
      });
    });

    it('returns empty removed array when product has no images', async () => {
      prisma.product.findUnique.mockResolvedValue({
        id: productId,
        storeId,
        images: [],
      });
      prisma.product.update.mockResolvedValue({});

      const result = await service.clearImages(productId, storeId, ownerId);

      expect(result).toEqual({ removed: [] });
    });
  });

  describe('addVariantImage', () => {
    beforeEach(() => {
      prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
      prisma.product.findUnique.mockResolvedValue({ id: productId, storeId });
    });

    it('sets imageOverride on the owned variant', async () => {
      prisma.productVariant.findUnique.mockResolvedValue({
        id: 'v1',
        productId,
        storeId,
      });
      prisma.productVariant.update.mockResolvedValue({});

      await service.addVariantImage(
        'v1',
        productId,
        storeId,
        ownerId,
        'photo.png',
      );

      expect(prisma.productVariant.update).toHaveBeenCalledWith({
        where: { id: 'v1' },
        data: { imageOverride: 'photo.png' },
      });
    });

    it('throws NotFoundException when the variant does not exist', async () => {
      prisma.productVariant.findUnique.mockResolvedValue(null);

      await expect(
        service.addVariantImage('v1', productId, storeId, ownerId, 'photo.png'),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws NotFoundException when the variant belongs to a different product', async () => {
      prisma.productVariant.findUnique.mockResolvedValue({
        id: 'v1',
        productId: 'other-product',
        storeId,
      });

      await expect(
        service.addVariantImage('v1', productId, storeId, ownerId, 'photo.png'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
