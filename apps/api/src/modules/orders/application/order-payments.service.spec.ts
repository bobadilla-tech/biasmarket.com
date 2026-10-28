import { type Mock, vi } from 'vitest';
import {
  OrderPaymentsService,
  normalizeOperationCode,
} from './order-payments.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

describe('OrderPaymentsService', () => {
  it('normalizes operation codes without spaces or case differences', () => {
    expect(normalizeOperationCode('  ab 12\tcd ')).toBe('AB12CD');
  });

  it('finds codes within a store using normalized comparison', async () => {
    const queryRaw: Mock = vi.fn().mockResolvedValue([{ id: 'payment-1' }]);
    const service = new OrderPaymentsService({
      $queryRaw: queryRaw,
    } as never as PrismaService);

    await expect(
      service.findDuplicateOperationCode('store-1', ' ab 12 cd '),
    ).resolves.toBe('payment-1');
    expect(queryRaw).toHaveBeenCalledTimes(1);
    expect(queryRaw.mock.calls[0]?.[0]?.join('')).toContain('regexp_replace');
  });

  it('skips blank codes', async () => {
    const queryRaw: Mock = vi.fn();
    const service = new OrderPaymentsService({
      $queryRaw: queryRaw,
    } as never as PrismaService);

    await expect(
      service.findDuplicateOperationCode('store-1', '  '),
    ).resolves.toBeNull();
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
