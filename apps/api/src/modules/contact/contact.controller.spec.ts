import { Test, TestingModule } from '@nestjs/testing';
import { vi, type Mock } from 'vitest';
import { ContactController } from './contact.controller.js';
import { ContactService } from './contact.service.js';

vi.mock('@thallesp/nestjs-better-auth', () => ({
  AuthGuard: class AuthGuard {},
  Public: () => () => undefined,
  Roles: () => () => undefined,
}));

vi.mock('@nestjs/throttler', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nestjs/throttler')>();
  return { ...actual, ThrottlerGuard: class ThrottlerGuard {} };
});

describe('ContactController', () => {
  let controller: ContactController;
  let service: { create: Mock; findAll: Mock; markReviewed: Mock };

  beforeEach(async () => {
    service = {
      create: vi.fn(),
      findAll: vi.fn(),
      markReviewed: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContactController],
      providers: [{ provide: ContactService, useValue: service }],
    }).compile();

    controller = module.get<ContactController>(ContactController);
  });

  it('create() delegates to service.create with the dto', () => {
    const dto = { name: 'Jane', email: 'jane@example.com', message: 'Hi' };

    controller.create(dto);

    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('findAll() delegates to service.findAll', () => {
    controller.findAll();

    expect(service.findAll).toHaveBeenCalled();
  });

  it('markReviewed() delegates to service.markReviewed with the id', () => {
    controller.markReviewed('inquiry-1');

    expect(service.markReviewed).toHaveBeenCalledWith('inquiry-1');
  });
});
