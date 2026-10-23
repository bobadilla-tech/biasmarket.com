import { Test, type TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { type Mock, vi } from 'vitest';

vi.mock('@thallesp/nestjs-better-auth', () => ({
  AuthGuard: class AuthGuard {},
  Session: () => () => undefined,
}));

import { CustomersController } from './customers.controller.js';
import { CustomersService } from '../application/customers.service.js';

describe('CustomersController.lookup', () => {
  let controller: CustomersController;
  let customers: { lookupByPhone: Mock };

  const storeId = 'store-1';
  const session = { user: { id: 'user-1' } } as any;

  beforeEach(async () => {
    customers = { lookupByPhone: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [CustomersController],
      providers: [{ provide: CustomersService, useValue: customers }],
    }).compile();

    controller = module.get(CustomersController);
  });

  // Express parses `?phone=a&phone=b` as an array, and the parameter type
  // annotation is not runtime validation — reaching `.trim()` on it threw.
  it('rejects a repeated phone parameter as a 400 instead of crashing on trim', async () => {
    await expect(
      controller.lookup(storeId, ['987654321', '987654322'] as any, session),
    ).rejects.toThrow(BadRequestException);

    expect(customers.lookupByPhone).not.toHaveBeenCalled();
  });

  it('rejects a missing or blank phone', async () => {
    await expect(
      controller.lookup(storeId, undefined, session),
    ).rejects.toThrow(BadRequestException);
    await expect(controller.lookup(storeId, '   ', session)).rejects.toThrow(
      BadRequestException,
    );

    expect(customers.lookupByPhone).not.toHaveBeenCalled();
  });

  it('passes the raw phone through once it is a non-blank string', async () => {
    customers.lookupByPhone.mockResolvedValueOnce({ previousOrders: 0 });

    await controller.lookup(storeId, ' 987654321 ', session);

    expect(customers.lookupByPhone).toHaveBeenCalledWith(
      storeId,
      'user-1',
      ' 987654321 ',
    );
  });
});
