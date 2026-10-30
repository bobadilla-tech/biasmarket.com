import { type Mock, vi } from 'vitest';
import {
  BuyerPaymentProofService,
  type BuyerProofOrder,
} from './buyer-payment-proof.service.js';
import type { ValidatedUploadedFile } from '../../../common/uploaded-file-validation.pipe.js';

const file = {
  buffer: Buffer.from('x'),
  detectedMimeType: 'image/png',
  originalname: 'secret-name.png',
} as unknown as ValidatedUploadedFile;

const NOW = new Date('2026-10-28T12:00:00.000Z');

const baseOrder: BuyerProofOrder = {
  id: 'order-1',
  storeId: 'store-1',
  status: 'ACTIVE',
  paymentStatus: 'PENDING_PAYMENT',
  fulfillmentStatus: 'ORDERING',
  expiresAt: new Date('2026-10-29T12:00:00.000Z'),
  requiredAmount: '100.00',
  currency: 'PEN',
  payments: [],
};

const proof = (amount: string, extra: Record<string, unknown> = {}) => ({
  amount,
  source: 'BUYER_SUBMITTED',
  reviewStatus: 'PENDING_REVIEW',
  voidedAt: null,
  ...extra,
});

describe('BuyerPaymentProofService.submit', () => {
  let service: BuyerPaymentProofService;
  let upload: Mock;
  let deleteImage: Mock;
  let tx: {
    $queryRaw: Mock;
    order: { findFirst: Mock };
    orderPayment: { findMany: Mock; create: Mock };
  };
  let events: { record: Mock };
  let notifications: { createIfNotOpen: Mock };

  const currentOrder = (overrides: Record<string, unknown> = {}) => ({
    status: 'ACTIVE',
    paymentStatus: 'PENDING_PAYMENT',
    fulfillmentStatus: 'ORDERING',
    expiresAt: new Date('2026-10-29T12:00:00.000Z'),
    requiredAmount: '100.00',
    ...overrides,
  });

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    upload = vi.fn().mockResolvedValue('https://cdn.example/p.png');
    deleteImage = vi.fn().mockResolvedValue(undefined);
    tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'order-1' }]),
      order: { findFirst: vi.fn().mockResolvedValue(currentOrder()) },
      orderPayment: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'payment-1' }),
      },
    };
    events = { record: vi.fn() };
    notifications = { createIfNotOpen: vi.fn() };
    service = new BuyerPaymentProofService(
      { $transaction: (cb: (t: unknown) => unknown) => cb(tx) } as never,
      { uploadPaymentImage: upload, deleteImage } as never,
      notifications as never,
      events as never,
    );
  });

  afterEach(() => vi.useRealTimers());

  const submit = (
    order: Partial<BuyerProofOrder> = {},
    fields: {
      amount?: unknown;
      method?: unknown;
      note?: unknown;
      operationCode?: unknown;
    } = {},
  ) =>
    service.submit({
      order: { ...baseOrder, ...order },
      file,
      amount: '40',
      method: 'YAPE',
      note: undefined,
      ...fields,
    });

  describe('state rules (pre-check)', () => {
    it.each([
      [{ paymentStatus: 'CANCELLED' }, 'cancelada'],
      [{ status: 'CANCELLED' }, 'cancelada'],
      [{ paymentStatus: 'REJECTED' }, 'rechazada'],
      [
        { paymentStatus: 'VERIFIED', payments: [paid('100.00')] },
        'ya está pagada',
      ],
      [{ fulfillmentStatus: 'IN_TRANSIT' }, 'enviada'],
      [{ fulfillmentStatus: 'READY' }, 'enviada'],
      [{ fulfillmentStatus: 'COMPLETED' }, 'enviada'],
      [{ expiresAt: new Date('2026-10-28T11:59:59.000Z') }, 'venció'],
    ])('rejects %j without uploading', async (order, message) => {
      await expect(submit(order as Partial<BuyerProofOrder>)).rejects.toThrow(
        message,
      );
      expect(upload).not.toHaveBeenCalled();
    });

    it('accepts a VERIFIED order with a residual balance', async () => {
      await expect(
        submit({ paymentStatus: 'VERIFIED', payments: [paid('60.00')] }),
      ).resolves.toEqual({ id: 'payment-1' });
    });

    it('does not apply the deadline to an order that is not awaiting payment', async () => {
      await expect(
        submit({
          paymentStatus: 'VERIFIED',
          payments: [paid('60.00')],
          expiresAt: new Date('2020-01-01T00:00:00.000Z'),
        }),
      ).resolves.toBeDefined();
    });
  });

  describe('input validation', () => {
    it.each([
      '0',
      '0.00',
      '0.001',
      '1e2',
      '0x10',
      '-5',
      '1,5',
      '100.',
      ' 40',
      '1234567890',
      '',
      'abc',
    ])('rejects the amount %j', async (amount) => {
      await expect(submit({}, { amount })).rejects.toThrow('Monto inválido');
      expect(upload).not.toHaveBeenCalled();
    });

    it('rejects non-string amounts', async () => {
      await expect(submit({}, { amount: ['40'] })).rejects.toThrow(
        'Monto inválido',
      );
      await expect(submit({}, { amount: 40 })).rejects.toThrow(
        'Monto inválido',
      );
    });

    it.each(['40', '40.5', '40.50', '0.01'])(
      'accepts the amount %j',
      async (a) => {
        await expect(submit({}, { amount: a })).resolves.toBeDefined();
      },
    );

    it('rejects an amount over the balance, counting pending proofs', async () => {
      await expect(submit({}, { amount: '100.01' })).rejects.toThrow(
        'excede el saldo',
      );
      await expect(
        submit({ payments: [proof('80.00')] }, { amount: '30' }),
      ).rejects.toThrow('excede el saldo');
      expect(upload).not.toHaveBeenCalled();
    });

    it('ignores voided pending proofs when reserving', async () => {
      await expect(
        submit(
          { payments: [proof('80.00', { voidedAt: new Date() })] },
          { amount: '100' },
        ),
      ).resolves.toBeDefined();
    });

    it('rejects an unknown or non-string method', async () => {
      await expect(submit({}, { method: 'BITCOIN' })).rejects.toThrow('método');
      await expect(submit({}, { method: ['YAPE'] })).rejects.toThrow('método');
      expect(upload).not.toHaveBeenCalled();
    });

    it('rejects a non-string note and one over 500 characters', async () => {
      await expect(submit({}, { note: { a: 1 } })).rejects.toThrow('Nota');
      await expect(submit({}, { note: 'x'.repeat(501) })).rejects.toThrow(
        '500 caracteres',
      );
      expect(upload).not.toHaveBeenCalled();
    });

    it('stores a sanitized note and a normalized operation code', async () => {
      await submit(
        {},
        { note: 'hola\n\u202Emundo', operationCode: '  ＡＢ-12 ' },
      );
      const data = tx.orderPayment.create.mock.calls[0][0].data;
      expect(data.note).toBe('hola mundo');
      expect(data.operationCode).toBe('AB-12');
    });

    it.each([
      ['non-string', 123],
      ['NUL', 'AB\u0000C'],
      ['newline', 'AB\nC'],
      ['zero-width', 'AB​C'],
      ['too long', 'A'.repeat(65)],
      ['symbols only', '---'],
      ['non-ASCII only', 'ÁÉ'],
    ])('rejects an operation code that is %s', async (_n, operationCode) => {
      await expect(submit({}, { operationCode })).rejects.toThrow(
        'Código de operación inválido',
      );
      expect(upload).not.toHaveBeenCalled();
    });

    it('stores null for a blank or missing operation code', async () => {
      await submit({}, { operationCode: '   ' });
      expect(tx.orderPayment.create.mock.calls[0][0].data.operationCode).toBe(
        null,
      );
    });
  });

  describe('cap of pending proofs', () => {
    const five = Array.from({ length: 5 }, () => proof('1.00'));

    it('rejects a sixth pending proof before uploading', async () => {
      await expect(submit({ payments: five }, { amount: '1' })).rejects.toThrow(
        'pendientes de revisión',
      );
      expect(upload).not.toHaveBeenCalled();
    });

    it('allows the fifth', async () => {
      await expect(
        submit({ payments: five.slice(0, 4) }, { amount: '1' }),
      ).resolves.toBeDefined();
    });

    it('counts under the lock and deletes the uploaded object', async () => {
      tx.orderPayment.findMany.mockResolvedValue(five);
      await expect(submit({}, { amount: '1' })).rejects.toThrow(
        'pendientes de revisión',
      );
      expect(tx.orderPayment.create).not.toHaveBeenCalled();
      expect(deleteImage).toHaveBeenCalledWith('https://cdn.example/p.png');
    });
  });

  describe('in the locked transaction', () => {
    it('locks by id and store and reads the order scoped to the store', async () => {
      await submit();
      expect(tx.order.findFirst.mock.calls[0][0].where).toEqual({
        id: 'order-1',
        storeId: 'store-1',
      });
      expect(tx.orderPayment.findMany.mock.calls[0][0].where).toEqual({
        orderId: 'order-1',
        storeId: 'store-1',
      });
    });

    it.each([
      [
        'cancelled in between',
        { status: 'CANCELLED', paymentStatus: 'CANCELLED' },
        'cancelada',
      ],
      ['rejected in between', { paymentStatus: 'REJECTED' }, 'rechazada'],
      ['shipped in between', { fulfillmentStatus: 'IN_TRANSIT' }, 'enviada'],
      [
        'expired in between',
        { expiresAt: new Date('2026-10-28T11:00:00.000Z') },
        'venció',
      ],
    ])('rejects when the order was %s', async (_n, change, message) => {
      tx.order.findFirst.mockResolvedValue(currentOrder(change));
      await expect(submit()).rejects.toThrow(message);
      expect(tx.orderPayment.create).not.toHaveBeenCalled();
      expect(deleteImage).toHaveBeenCalledTimes(1);
    });

    it('does not trust the stale balance handed in by the caller', async () => {
      tx.orderPayment.findMany.mockResolvedValue([proof('90.00')]);
      await expect(submit({}, { amount: '40' })).rejects.toThrow(
        'excede el saldo',
      );
      expect(tx.orderPayment.create).not.toHaveBeenCalled();
      expect(deleteImage).toHaveBeenCalledTimes(1);
      // The read only counts if it happens after the row lock.
      expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
        tx.orderPayment.findMany.mock.invocationCallOrder[0],
      );
    });

    it('uses the required amount read under the lock', async () => {
      tx.order.findFirst.mockResolvedValue(
        currentOrder({ requiredAmount: '30.00' }),
      );
      await expect(submit({}, { amount: '40' })).rejects.toThrow(
        'excede el saldo',
      );
    });

    it('404s when the order vanished and cleans up', async () => {
      tx.$queryRaw.mockResolvedValue([]);
      await expect(submit()).rejects.toThrow('Orden no encontrada');
      expect(deleteImage).toHaveBeenCalledTimes(1);
    });

    it('survives a failing cleanup and rethrows the original error', async () => {
      tx.$queryRaw.mockResolvedValue([]);
      deleteImage.mockRejectedValue(new Error('s3 down'));
      await expect(submit()).rejects.toThrow('Orden no encontrada');
    });
  });

  describe('success', () => {
    it('creates a pending buyer row without paidAt', async () => {
      await submit({}, { operationCode: 'op-1' });
      expect(upload).toHaveBeenCalledWith(file.buffer, 'image/png');
      const data = tx.orderPayment.create.mock.calls[0][0].data;
      expect(data).toMatchObject({
        orderId: 'order-1',
        storeId: 'store-1',
        source: 'BUYER_SUBMITTED',
        reviewStatus: 'PENDING_REVIEW',
        method: 'YAPE',
        paidAt: null,
        imageUrl: 'https://cdn.example/p.png',
      });
      expect(String(data.amount)).toBe('40');
    });

    it('records an event with exactly paymentId, amount (number) and method', async () => {
      await submit({}, { note: 'private note', operationCode: 'SECRET1' });
      expect(events.record).toHaveBeenCalledWith(tx, {
        orderId: 'order-1',
        storeId: 'store-1',
        type: 'PAYMENT_SUBMITTED',
        actor: 'BUYER',
        payload: { paymentId: 'payment-1', amount: 40, method: 'YAPE' },
      });
    });

    it('never leaks the code, note or file name into event or notification', async () => {
      await submit({}, { note: 'private note', operationCode: 'SECRET1' });
      const emitted = JSON.stringify([
        events.record.mock.calls,
        notifications.createIfNotOpen.mock.calls,
      ]);
      expect(emitted).not.toContain('SECRET1');
      expect(emitted).not.toContain('private note');
      expect(emitted).not.toContain('secret-name');
      expect(notifications.createIfNotOpen).toHaveBeenCalledTimes(1);
      expect(notifications.createIfNotOpen).toHaveBeenCalledWith(
        expect.objectContaining({
          storeId: 'store-1',
          type: 'PAYMENT_PROOF_SUBMITTED',
          entityId: 'order-1',
        }),
        tx,
      );
      expect(deleteImage).not.toHaveBeenCalled();
    });
  });
});

function paid(amount: string) {
  return {
    amount,
    source: 'SELLER_RECORDED',
    reviewStatus: 'N_A',
    voidedAt: null,
  };
}
