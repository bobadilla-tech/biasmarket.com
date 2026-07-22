import { Test, TestingModule } from '@nestjs/testing';
import { vi, type Mock } from 'vitest';
import { StoresController } from './stores.controller.js';
import { StoresService } from './stores.service.js';
import { StorageService } from '../../storage/storage.service.js';

vi.mock('@thallesp/nestjs-better-auth', () => ({
  AuthGuard: class AuthGuard {},
  Session: () => () => undefined,
  Public: () => () => undefined,
}));

describe('StoresController', () => {
  let controller: StoresController;
  let service: { create: Mock };

  beforeEach(async () => {
    service = { create: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StoresController],
      providers: [
        { provide: StoresService, useValue: service },
        { provide: StorageService, useValue: { uploadImage: vi.fn() } },
      ],
    }).compile();

    controller = module.get<StoresController>(StoresController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create() delegates to service.create with userId and the dto', () => {
    const session = { user: { id: 'user-1' } } as never;
    const dto = { name: 'My Store', slug: 'my-store', whatsappNumber: '+51999999999' };

    controller.create(session, dto);

    expect(service.create).toHaveBeenCalledWith('user-1', dto);
  });
});
