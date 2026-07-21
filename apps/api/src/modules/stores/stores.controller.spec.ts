import { Test, TestingModule } from '@nestjs/testing';
import { vi, type Mock } from 'vitest';
import { StoresController } from './stores.controller.js';
import { StoresService } from './stores.service.js';

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
      providers: [{ provide: StoresService, useValue: service }],
    }).compile();

    controller = module.get<StoresController>(StoresController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('create() delegates to service.create with userId, name, slug', () => {
    const session = { user: { id: 'user-1' } } as never;

    controller.create(session, { name: 'My Store', slug: 'my-store' });

    expect(service.create).toHaveBeenCalledWith(
      'user-1',
      'My Store',
      'my-store',
    );
  });
});
