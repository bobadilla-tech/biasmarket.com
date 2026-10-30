import { ConflictException } from '@nestjs/common';
import { upsertAssistedCustomer } from './assisted-customer.js';

function makeTx(findResults: Array<{ id: string } | null>) {
  const findUnique = vi.fn();
  for (const result of findResults) findUnique.mockResolvedValueOnce(result);
  return {
    $executeRaw: vi.fn().mockResolvedValue(1),
    customer: {
      findUnique,
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
}

describe('upsertAssistedCustomer', () => {
  it('inserts with DO NOTHING, reads the row and sets the name only when empty', async () => {
    const tx = makeTx([{ id: 'c1' }]);
    const result = await upsertAssistedCustomer(
      tx as never,
      'store1',
      '+51987654321',
      ' Sofi ',
    );
    expect(result).toEqual({ id: 'c1' });
    const statements = tx.$executeRaw.mock.calls.map(([query]) =>
      (query as string[]).join('?'),
    );
    expect(statements[0]).toContain('pg_advisory_xact_lock');
    expect(statements[1]).toContain(
      'ON CONFLICT ("storeId", "phone") DO NOTHING',
    );
    expect(tx.customer.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', storeId: 'store1', name: null },
      data: { name: 'Sofi' },
    });
  });

  it('skips the name update without an alias', async () => {
    const tx = makeTx([{ id: 'c1' }]);
    await upsertAssistedCustomer(tx as never, 's', '+51987654321', '  ');
    expect(tx.customer.updateMany).not.toHaveBeenCalled();
  });

  it('retries the insert once when the row vanished before the read', async () => {
    const tx = makeTx([null, { id: 'c2' }]);
    const result = await upsertAssistedCustomer(
      tx as never,
      's',
      '+51987654321',
      null,
    );
    expect(result).toEqual({ id: 'c2' });
    expect(tx.$executeRaw).toHaveBeenCalledTimes(3);
  });

  it('throws a 409 that does not carry the phone after a second miss', async () => {
    const tx = makeTx([null, null]);
    const error = await upsertAssistedCustomer(
      tx as never,
      's',
      '+51987654321',
      null,
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ConflictException);
    expect(
      JSON.stringify((error as ConflictException).getResponse()),
    ).not.toMatch(/\d{8,}/);
  });
});
