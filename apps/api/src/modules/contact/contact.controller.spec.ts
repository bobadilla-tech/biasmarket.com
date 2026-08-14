import { Test, type TestingModule } from '@nestjs/testing';
import { type Mock, vi } from 'vitest';
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

const inquiryRow = {
  id: 'inquiry-1',
  name: 'Jane',
  email: 'jane@example.com',
  company: null,
  inquiryType: null,
  message: 'Hi',
  status: 'NEW' as const,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
};

describe('ContactController', () => {
  let controller: ContactController;
  let service: { create: Mock; findAll: Mock; markReviewed: Mock };

  beforeEach(async () => {
    service = {
      create: vi.fn().mockResolvedValue(inquiryRow),
      findAll: vi.fn().mockResolvedValue([inquiryRow]),
      markReviewed: vi.fn().mockResolvedValue(inquiryRow),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ContactController],
      providers: [{ provide: ContactService, useValue: service }],
    }).compile();

    controller = module.get<ContactController>(ContactController);
  });

  it('create() delegates to service.create with the dto', async () => {
    const dto = { name: 'Jane', email: 'jane@example.com', message: 'Hi' };

    await controller.create(dto);

    expect(service.create).toHaveBeenCalledWith(dto);
  });

  it('findAll() delegates to service.findAll', async () => {
    await controller.findAll();

    expect(service.findAll).toHaveBeenCalled();
  });

  it('markReviewed() delegates to service.markReviewed with the id', async () => {
    await controller.markReviewed('inquiry-1');

    expect(service.markReviewed).toHaveBeenCalledWith('inquiry-1');
  });
});
