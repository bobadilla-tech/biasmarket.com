import { Test, TestingModule } from '@nestjs/testing';
import { vi, type Mock } from 'vitest';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';

vi.mock('@thallesp/nestjs-better-auth', () => ({
  AuthGuard: class AuthGuard {},
  Session: () => () => undefined,
}));

describe('ProductsController', () => {
  let controller: ProductsController;
  let service: {
    create: Mock;
    findAllForStore: Mock;
    update: Mock;
    publish: Mock;
    softDelete: Mock;
    addVariant: Mock;
    listVariants: Mock;
  };

  const storeId = 'store-1';
  const productId = 'product-1';
  const session = { user: { id: 'user-1' } } as never;

  beforeEach(async () => {
    service = {
      create: vi.fn(),
      findAllForStore: vi.fn(),
      update: vi.fn(),
      publish: vi.fn(),
      softDelete: vi.fn(),
      addVariant: vi.fn(),
      listVariants: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ProductsController],
      providers: [{ provide: ProductsService, useValue: service }],
    }).compile();

    controller = module.get<ProductsController>(ProductsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create() delegates to service.create with storeId, userId, dto', () => {
    const dto = { name: 'Widget', price: 10 } as never;

    controller.create(storeId, session, dto);

    expect(service.create).toHaveBeenCalledWith(storeId, 'user-1', dto);
  });

  it('findAll() delegates to service.findAllForStore with storeId, userId', () => {
    controller.findAll(storeId, session);

    expect(service.findAllForStore).toHaveBeenCalledWith(storeId, 'user-1');
  });

  it('update() delegates to service.update with productId, storeId, userId, dto', () => {
    const dto = { name: 'Renamed' } as never;

    controller.update(storeId, productId, session, dto);

    expect(service.update).toHaveBeenCalledWith(
      productId,
      storeId,
      'user-1',
      dto,
    );
  });

  it('publish() delegates to service.publish with productId, storeId, userId', () => {
    controller.publish(storeId, productId, session);

    expect(service.publish).toHaveBeenCalledWith(productId, storeId, 'user-1');
  });

  it('softDelete() delegates to service.softDelete with productId, storeId, userId', () => {
    controller.softDelete(storeId, productId, session);

    expect(service.softDelete).toHaveBeenCalledWith(
      productId,
      storeId,
      'user-1',
    );
  });

  it('addVariant() delegates to service.addVariant with productId, storeId, userId, dto', () => {
    const dto = { name: 'Large' } as never;

    controller.addVariant(storeId, productId, session, dto);

    expect(service.addVariant).toHaveBeenCalledWith(
      productId,
      storeId,
      'user-1',
      dto,
    );
  });

  it('listVariants() delegates to service.listVariants with productId, storeId, userId', () => {
    controller.listVariants(storeId, productId, session);

    expect(service.listVariants).toHaveBeenCalledWith(
      productId,
      storeId,
      'user-1',
    );
  });
});
