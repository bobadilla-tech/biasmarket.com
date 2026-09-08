import { Test, type TestingModule } from '@nestjs/testing';
import { type Mock, vi } from 'vitest';
import { StoresController } from './stores.controller.js';
import { StoresService } from './stores.service.js';
import { StorageService } from '../../storage/storage.service.js';

vi.mock('@nestjs/throttler', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs/throttler')>();
  return { ...actual, ThrottlerGuard: class ThrottlerGuard {} };
});

vi.mock('@thallesp/nestjs-better-auth', () => ({
  AuthGuard: class AuthGuard {},
  Session: () => () => undefined,
  Public: () => () => undefined,
  Roles: () => () => undefined,
}));

describe('StoresController', () => {
  let controller: StoresController;
  let service: { create: Mock; assertOwnership: Mock };
  let storage: { uploadImage: Mock; uploadStoreContentImage: Mock };

  beforeEach(async () => {
    service = { create: vi.fn(), assertOwnership: vi.fn() };
    storage = {
      uploadImage: vi.fn(),
      uploadStoreContentImage: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StoresController],
      providers: [
        { provide: StoresService, useValue: service },
        { provide: StorageService, useValue: storage },
      ],
    }).compile();

    controller = module.get<StoresController>(StoresController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create() delegates to service.create with userId and the dto', async () => {
    const session = { user: { id: 'user-1' } } as never;
    const dto = {
      name: 'My Store',
      slug: 'my-store',
      whatsappNumber: '+51999999999',
    };
    service.create.mockResolvedValue({
      id: 'store-1',
      name: 'My Store',
      slug: 'my-store',
      locale: 'es',
      ownerId: 'user-1',
      themeConfig: {},
      logoUrl: null,
      paymentInstructions: '',
      whatsappNumber: '+51999999999',
      defaultCurrency: 'PEN',
      holdWindowHours: 48,
      lowStockThreshold: 5,
      lowStockAlertsEnabled: true,
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
    });

    await controller.create(session, dto);

    expect(service.create).toHaveBeenCalledWith('user-1', dto);
  });

  describe('uploadContentImage()', () => {
    const session = { user: { id: 'user-1' } } as never;
    const file = {
      buffer: Buffer.from('img'),
      detectedMimeType: 'image/png',
    } as never;

    it('asserts ownership before uploading and returns the stored url', async () => {
      storage.uploadStoreContentImage.mockResolvedValue(
        'https://cdn.biasmarket.com/products/store-content/a.png',
      );

      const result = await controller.uploadContentImage(
        'store-1',
        session,
        file,
      );

      expect(service.assertOwnership).toHaveBeenCalledWith('store-1', 'user-1');
      expect(service.assertOwnership.mock.invocationCallOrder[0]).toBeLessThan(
        storage.uploadStoreContentImage.mock.invocationCallOrder[0],
      );
      expect(result).toEqual({
        url: 'https://cdn.biasmarket.com/products/store-content/a.png',
      });
    });

    it('does not upload when ownership assertion rejects', async () => {
      service.assertOwnership.mockRejectedValue(new Error('forbidden'));

      await expect(
        controller.uploadContentImage('store-1', session, file),
      ).rejects.toThrow('forbidden');
      expect(storage.uploadStoreContentImage).not.toHaveBeenCalled();
    });
  });
});
