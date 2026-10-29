import { type Mock, vi } from 'vitest';
import {
  assertAcceptsSellerPayments,
  assertSellerPaymentInput,
  assertWithinSellerLimit,
  OrderPaymentsService,
  reservedPendingCents,
} from './order-payments.service.js';
import { PrismaService } from '../../../prisma/prisma.service.js';

const NOW = new Date('2026-10-28T12:00:00.000Z');
const valid = (overrides: Record<string, unknown> = {}) => ({
  amount: '40',
  method: 'YAPE',
  hasCapture: true,
  ...overrides,
});

describe('assertSellerPaymentInput', () => {
  it('accepts a minimal valid payment and defaults paidAt to now', () => {
    expect(assertSellerPaymentInput(valid(), NOW)).toEqual({
      amount: '40',
      amountCents: 4000,
      method: 'YAPE',
      operationCode: null,
      paidAt: NOW,
      confirmDuplicate: false,
    });
  });

  it.each(['1e2', '0x10', '0.001', '0', '0.00', '-1', '1,5', '100.', ' 5', ''])(
    'rejects the amount %j',
    (amount) => {
      expect(() => assertSellerPaymentInput(valid({ amount }), NOW)).toThrow(
        'Monto inválido',
      );
    },
  );

  it('rejects non-string amounts', () => {
    expect(() => assertSellerPaymentInput(valid({ amount: 40 }), NOW)).toThrow(
      'Monto inválido',
    );
    expect(() =>
      assertSellerPaymentInput(valid({ amount: ['40'] }), NOW),
    ).toThrow('Monto inválido');
  });

  it('requires a known method', () => {
    expect(() =>
      assertSellerPaymentInput(valid({ method: 'BITCOIN' }), NOW),
    ).toThrow('método');
    expect(() =>
      assertSellerPaymentInput(valid({ method: undefined }), NOW),
    ).toThrow('método');
  });

  it('requires a capture for everything but CASH', () => {
    for (const method of ['YAPE', 'PLIN', 'TRANSFER']) {
      expect(() =>
        assertSellerPaymentInput(valid({ method, hasCapture: false }), NOW),
      ).toThrow('captura');
    }
    expect(
      assertSellerPaymentInput(
        valid({ method: 'CASH', hasCapture: false }),
        NOW,
      ).method,
    ).toBe('CASH');
  });

  describe('operationCode', () => {
    const code = (operationCode: unknown) =>
      assertSellerPaymentInput(valid({ operationCode }), NOW).operationCode;

    it('stores the NFKC-trimmed form, keeping separators', () => {
      expect(code('  ＡＢ-12 ')).toBe('AB-12');
    });

    it('treats blank as no code', () => {
      expect(code('   ')).toBeNull();
      expect(code(undefined)).toBeNull();
    });

    it.each([
      ['non-string', 7],
      ['a NUL', 'AB\u0000C'],
      ['a newline', 'AB\nC'],
      ['a zero-width space', 'AB​C'],
      ['too long', 'A'.repeat(65)],
      ['symbols only', '---'],
      ['non-ASCII only', 'ÁÉ'],
    ])('rejects %s', (_n, value) => {
      expect(() => code(value)).toThrow('Código de operación inválido');
    });

    it('accepts exactly 64 characters', () => {
      expect(code('A'.repeat(64))).toBe('A'.repeat(64));
    });
  });

  describe('paidAt', () => {
    const paidAt = (value: unknown) =>
      assertSellerPaymentInput(valid({ paidAt: value }), NOW).paidAt;

    it('accepts ISO datetimes with Z or an offset', () => {
      expect(paidAt('2026-10-01T17:00:00.000Z')).toEqual(
        new Date('2026-10-01T17:00:00.000Z'),
      );
      expect(paidAt('2026-10-01T12:00:00-05:00')).toEqual(
        new Date('2026-10-01T17:00:00.000Z'),
      );
    });

    it.each([
      '2026-10-01',
      '2026-10-01T10:00:00',
      '2026-13-45T10:00:00Z',
      'x',
      5,
    ])('rejects %j', (value) => {
      expect(() => paidAt(value)).toThrow('Fecha de pago inválida');
    });

    it('allows up to 5 minutes of clock skew, no more', () => {
      expect(() => paidAt('2026-10-28T12:05:00.000Z')).not.toThrow();
      expect(() => paidAt('2026-10-28T12:05:01.000Z')).toThrow('futura');
    });

    it('treats an empty string as omitted', () => {
      expect(paidAt('')).toEqual(NOW);
    });
  });

  it('only the exact string "true" confirms a duplicate', () => {
    const confirm = (v: unknown) =>
      assertSellerPaymentInput(valid({ confirmDuplicate: v }), NOW)
        .confirmDuplicate;
    expect(confirm('true')).toBe(true);
    expect(confirm('TRUE')).toBe(false);
    expect(confirm('1')).toBe(false);
    expect(confirm(undefined)).toBe(false);
  });
});

describe('state and limit helpers', () => {
  const state = (overrides = {}) => ({
    paymentStatus: 'PENDING_PAYMENT',
    fulfillmentStatus: 'ORDERING',
    pendingAmount: 100,
    ...overrides,
  });

  it.each([
    [{ paymentStatus: 'CANCELLED' }, 'cancelada'],
    [{ status: 'CANCELLED' }, 'cancelada'],
    [{ paymentStatus: 'REJECTED' }, 'rechazada'],
    [{ paymentStatus: 'VERIFIED', pendingAmount: 0 }, 'ya está pagada'],
    [{ fulfillmentStatus: 'IN_TRANSIT' }, 'enviada'],
    [{ fulfillmentStatus: 'READY' }, 'enviada'],
    [{ fulfillmentStatus: 'COMPLETED' }, 'enviada'],
  ])('rejects %j', (override, message) => {
    expect(() => assertAcceptsSellerPayments(state(override))).toThrow(message);
  });

  it('accepts a VERIFIED order with a residual balance', () => {
    expect(() =>
      assertAcceptsSellerPayments(
        state({ paymentStatus: 'VERIFIED', pendingAmount: 20 }),
      ),
    ).not.toThrow();
  });

  it('sums only non-voided pending proofs, in cents', () => {
    expect(
      reservedPendingCents([
        { amount: '0.10', reviewStatus: 'PENDING_REVIEW' },
        { amount: 0.2, reviewStatus: 'PENDING_REVIEW' },
        { amount: '9', reviewStatus: 'APPROVED' },
        { amount: '9', reviewStatus: 'PENDING_REVIEW', voidedAt: new Date() },
      ]),
    ).toBe(30);
  });

  it('limits to pending minus reserved, with a message naming the action', () => {
    expect(() => assertWithinSellerLimit(2000, 100, 8000)).not.toThrow();
    expect(() => assertWithinSellerLimit(2001, 100, 8000)).toThrow(
      'Rechaza o valida el comprobante pendiente',
    );
    expect(() => assertWithinSellerLimit(10001, 100, 0)).toThrow(
      'excede el saldo pendiente',
    );
    // Over the balance even ignoring proofs: the plain message.
    expect(() => assertWithinSellerLimit(10001, 100, 5000)).toThrow(
      'excede el saldo pendiente',
    );
  });

  it('compares in cents so a float artifact cannot reject an exact amount', () => {
    expect(() => assertWithinSellerLimit(5999, 59.99, 0)).not.toThrow();
  });
});

describe('OrderPaymentsService.findDuplicateOperationCode', () => {
  const service = (queryRaw: Mock) =>
    new OrderPaymentsService({ $queryRaw: queryRaw } as never as PrismaService);

  it('queries with an ASCII-only comparison scoped by store through the order', async () => {
    const queryRaw: Mock = vi.fn().mockResolvedValue([{ orderId: 'order-9' }]);
    await expect(
      service(queryRaw).findDuplicateOperationCode('store-1', ' op-12 cd ', {
        currentOrderId: 'order-1',
      }),
    ).resolves.toEqual({ orderId: 'order-9' });

    const [strings, ...params] = queryRaw.mock.calls[0]!;
    const sql = (strings as string[]).join('?');
    expect(sql).toContain("'[^A-Za-z0-9]'");
    expect(sql).not.toContain('[[:alnum:]]');
    expect(sql).toContain('o."storeId" =');
    expect(sql).toContain('p."voidedAt" IS NULL');
    expect(sql).toContain(`<> 'REJECTED'`);
    expect(sql).toContain("'PENDING_REVIEW'");
    expect(params).toContain('store-1');
    expect(params).toContain('order-1');
    expect(params).toContain('OP12CD');
  });

  it('returns only the order id, nothing else', async () => {
    const queryRaw: Mock = vi
      .fn()
      .mockResolvedValue([{ orderId: 'order-9', id: 'p', operationCode: 'X' }]);
    const found = await service(queryRaw).findDuplicateOperationCode(
      's',
      'abc',
      { currentOrderId: 'o' },
    );
    expect(Object.keys(found!)).toEqual(['orderId']);
  });

  it('returns null when nothing matches', async () => {
    const queryRaw: Mock = vi.fn().mockResolvedValue([]);
    await expect(
      service(queryRaw).findDuplicateOperationCode('s', 'abc', {
        currentOrderId: 'o',
      }),
    ).resolves.toBeNull();
  });

  it.each(['  ', '---', 'ÁÉ'])('skips %j without querying', async (code) => {
    const queryRaw: Mock = vi.fn();
    await expect(
      service(queryRaw).findDuplicateOperationCode('s', code, {
        currentOrderId: 'o',
      }),
    ).resolves.toBeNull();
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
