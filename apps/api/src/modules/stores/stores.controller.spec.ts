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
  let service: {
    create: Mock;
    assertOwnership: Mock;
    updatePublicHeaderImage: Mock;
    findPublicCatalog: Mock;
  };
  let storage: {
    uploadImage: Mock;
    uploadStoreContentImage: Mock;
    uploadStoreBanner: Mock;
    uploadStoreOwnerAvatar: Mock;
  };

  beforeEach(async () => {
    service = {
      create: vi.fn(),
      assertOwnership: vi.fn(),
      updatePublicHeaderImage: vi.fn(),
      findPublicCatalog: vi.fn(),
    };
    storage = {
      uploadImage: vi.fn(),
      uploadStoreContentImage: vi.fn(),
      uploadStoreBanner: vi.fn(),
      uploadStoreOwnerAvatar: vi.fn(),
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

  it('parses catalog filters and serializes public product values', async () => {
    service.findPublicCatalog.mockResolvedValue({
      page: 2,
      limit: 12,
      total: 1,
      items: [
        {
          id: 'product-1',
          price: { toString: () => '12.50' },
          availableUntil: new Date('2026-10-01T00:00:00.000Z'),
          deletedAt: null,
          createdAt: new Date('2026-09-01T00:00:00.000Z'),
          discontinued: false,
          variants: [
            {
              id: 'variant-1',
              priceOverride: { toString: () => '11.00' },
              attributes: {},
            },
          ],
          categories: [],
        },
      ],
    });

    const result = await controller.findPublicCatalog(
      'my-store',
      ' album ',
      ['photocards', 'bts'],
      'precio_asc',
      '2',
      '12',
    );

    expect(service.findPublicCatalog).toHaveBeenCalledWith('my-store', {
      page: 2,
      limit: 12,
      q: 'album',
      categories: ['photocards', 'bts'],
      sort: 'precio_asc',
    });
    expect(result).toMatchObject({
      page: 2,
      limit: 12,
      total: 1,
      items: [
        {
          id: 'product-1',
          price: '12.50',
          availableUntil: '2026-10-01T00:00:00.000Z',
          createdAt: '2026-09-01T00:00:00.000Z',
          variants: [{ id: 'variant-1', priceOverride: '11.00' }],
        },
      ],
    });
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

  describe('public header image uploads', () => {
    const session = { user: { id: 'user-1' } } as never;
    const file = {
      buffer: Buffer.from('image'),
      detectedMimeType: 'image/png',
    } as never;

    it('checks ownership before storing a banner and persists it to that store', async () => {
      storage.uploadStoreBanner.mockResolvedValue(
        'https://cdn.example/banner.png',
      );
      service.updatePublicHeaderImage.mockResolvedValue({
        id: 'store-1',
        name: 'Store',
        slug: 'store',
        locale: 'es',
        ownerId: 'user-1',
        themeConfig: {},
        logoUrl: null,
        bannerUrl: 'https://cdn.example/banner.png',
        locationLabel: null,
        publicOwnerName: null,
        publicOwnerAvatarUrl: null,
        bio: null,
        aboutMarkdown: null,
        paymentInstructions: '',
        whatsappNumber: null,
        instagramUrl: null,
        facebookUrl: null,
        tiktokUrl: null,
        twitterUrl: null,
        defaultCurrency: 'PEN',
        holdWindowHours: 48,
        lowStockThreshold: 5,
        lowStockAlertsEnabled: true,
        isPublic: true,
        isDemo: false,
        createdAt: new Date(),
      });

      const result = await controller.uploadBanner('store-1', session, file);

      expect(service.assertOwnership).toHaveBeenCalledWith('store-1', 'user-1');
      expect(service.assertOwnership.mock.invocationCallOrder[0]).toBeLessThan(
        storage.uploadStoreBanner.mock.invocationCallOrder[0],
      );
      expect(service.updatePublicHeaderImage).toHaveBeenCalledWith(
        'store-1',
        'user-1',
        'bannerUrl',
        'https://cdn.example/banner.png',
      );
      expect(result.bannerUrl).toBe('https://cdn.example/banner.png');
    });

    it('does not store a public avatar when ownership fails', async () => {
      service.assertOwnership.mockRejectedValue(new Error('forbidden'));
      await expect(
        controller.uploadPublicOwnerAvatar('store-2', session, file),
      ).rejects.toThrow('forbidden');
      expect(storage.uploadStoreOwnerAvatar).not.toHaveBeenCalled();
    });
  });
});
