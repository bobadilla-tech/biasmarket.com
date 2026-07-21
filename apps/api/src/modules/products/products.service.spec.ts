import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { vi, type Mock } from 'vitest';
import { ProductsService } from './products.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: {
    store: { findUnique: Mock };
    product: {
      findUnique: Mock;
      findMany: Mock;
      create: Mock;
      update: Mock;
    };
    productVariant: { create: Mock; findMany: Mock };
  };

  const ownerId = 'user-1';
  const storeId = 'store-1';
  const productId = 'product-1';

  beforeEach(async () => {
    prisma = {
      store: { findUnique: vi.fn() },
      product: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      productVariant: { create: vi.fn(), findMany: vi.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        { provide: PrismaService, useValue: prisma },
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
    prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId, defaultCurrency: 'PEN' });
    prisma.product.create.mockResolvedValue({ id: productId });
    const dto = { name: 'Widget', price: 10 };

    await service.create(storeId, ownerId, dto);

    expect(prisma.product.create).toHaveBeenCalledWith({
      data: { ...dto, storeId, currency: 'PEN' },
    });
  });

  it("create() uses the dto's currency instead of the store default when provided", async () => {
    prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId, defaultCurrency: 'PEN' });
    prisma.product.create.mockResolvedValue({ id: productId });
    const dto = { name: 'Widget', price: 10, currency: 'USD' };

    await service.create(storeId, ownerId, dto);

    expect(prisma.product.create).toHaveBeenCalledWith({
      data: { ...dto, storeId, currency: 'USD' },
    });
  });

  it('findAllForStore() filters out soft-deleted products and includes variants', async () => {
    prisma.store.findUnique.mockResolvedValue({ id: storeId, ownerId });
    prisma.product.findMany.mockResolvedValue([]);

    await service.findAllForStore(storeId, ownerId);

    expect(prisma.product.findMany).toHaveBeenCalledWith({
      where: { storeId, deletedAt: null },
      include: { variants: true },
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

    const expectedData: { deletedAt: Date; status: string } = {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment -- expect.any() is untyped in Jest's matcher API
      deletedAt: expect.any(Date),
      status: 'DRAFT',
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
});
