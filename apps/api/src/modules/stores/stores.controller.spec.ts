import { Test, TestingModule } from '@nestjs/testing';
import { StoresController } from './stores.controller';
import { StoresService } from './stores.service';

jest.mock('@thallesp/nestjs-better-auth', () => ({
  AuthGuard: class AuthGuard {},
  Session: () => () => undefined,
}));

describe('StoresController', () => {
  let controller: StoresController;
  let service: { create: jest.Mock };

  beforeEach(async () => {
    service = { create: jest.fn() };

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
