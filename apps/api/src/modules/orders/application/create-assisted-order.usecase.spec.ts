import { BadRequestException } from '@nestjs/common';
import type { Store } from '@biasmarket/db';
import { hashOrderAccessToken } from '@biasmarket/utils/assisted-order';
import { CreateAssistedOrderUseCase } from './create-assisted-order.usecase.js';
import type { CreateAssistedOrderDto } from '../dto/create-assisted-order.dto.js';

vi.mock('./order-creation.core.js', () => ({
  validateDeliveryPreTx: vi.fn().mockResolvedValue({}),
  lockAndValidate: vi.fn().mockResolvedValue({}),
  reserveItems: vi.fn(),
}));
vi.mock('./assisted-customer.js', () => ({
  upsertAssistedCustomer: vi.fn().mockResolvedValue({ id: 'cust1' }),
}));

const core = await import('./order-creation.core.js');

const store = { id: 'store1', slug: 'mi-tienda' } as Store;
const dto = {
  deliveryMethodType: 'PICKUP',
  customerPhone: '987 654 321',
  customerName: ' Sofi ',
  items: [{ productId: 'p', quantity: 1 }],
} as CreateAssistedOrderDto;

function setup(finalAmount: { lte: (n: number) => boolean }) {
  vi.mocked(core.reserveItems).mockResolvedValue({
    orderData: { storeId: 'store1' },
    finalAmount,
  } as never);
  const tx = {
    order: { create: vi.fn().mockResolvedValue({ id: 'o1' }) },
    auditLog: { create: vi.fn() },
  };
  const prisma = {
    $transaction: vi.fn((cb: (t: unknown) => unknown) => cb(tx)),
  };
  const events = { record: vi.fn() };
  const customers = { countPreviousOrders: vi.fn().mockResolvedValue(2) };
  const useCase = new CreateAssistedOrderUseCase(
    prisma as never,
    {} as never,
    events as never,
    customers as never,
  );
  return { useCase, tx, prisma, events };
}

describe('CreateAssistedOrderUseCase', () => {
  beforeEach(() => {
    process.env.WEB_URL = 'https://biasmarket.com';
  });

  it('stores only the token hash and returns the link once', async () => {
    const { useCase, tx, prisma, events } = setup({ lte: () => false });
    const result = await useCase.execute(store, 'user1', dto);

    expect(core.reserveItems).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      store,
      expect.objectContaining({ deliveryMethodType: 'PICKUP' }),
      'ASSISTED_ORDER_V1',
    );

    const token = result.accessUrl.split('/').pop()!;
    const data = tx.order.create.mock.calls[0]![0].data;
    expect(data).toMatchObject({
      source: 'VENDOR_ASSISTED',
      createdByUserId: 'user1',
      customerPhone: '+51987654321',
      customerPhoneNormalized: '+51987654321',
      customerName: 'Sofi',
      customerId: 'cust1',
      accessTokenHash: hashOrderAccessToken(token),
      accessTokenRevokedAt: null,
    });
    expect(JSON.stringify(data)).not.toContain(token);
    expect(result.previousOrders).toBe(2);
    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), {
      timeout: 15_000,
    });
    expect(events.record).toHaveBeenCalledWith(
      tx,
      expect.objectContaining({ type: 'CREATED', actor: 'SELLER' }),
    );
    const audit = JSON.stringify(tx.auditLog.create.mock.calls[0]![0]);
    expect(audit).not.toContain(token);
    expect(audit).not.toContain('Sofi');
    expect(audit).not.toMatch(/\d{8,}/);
  });

  it('rejects a total of 0 so the transaction rolls back', async () => {
    const { useCase, tx } = setup({ lte: () => true });
    await expect(useCase.execute(store, 'user1', dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.order.create).not.toHaveBeenCalled();
  });

  it('maps an invariant failure to a 400', async () => {
    const { useCase } = setup({ lte: () => false });
    await expect(useCase.execute(store, '  ', dto)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects an invalid phone before touching the database', async () => {
    const { useCase, prisma } = setup({ lte: () => false });
    await expect(
      useCase.execute(store, 'user1', { ...dto, customerPhone: 'abc' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
