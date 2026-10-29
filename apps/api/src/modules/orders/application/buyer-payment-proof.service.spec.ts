import { type Mock, vi } from 'vitest';
import { BuyerPaymentProofService } from './buyer-payment-proof.service.js';
import type { BuyerProofOrder } from './buyer-payment-proof.service.js';
import type { ValidatedUploadedFile } from '../../../common/uploaded-file-validation.pipe.js';

const file = {
  buffer: Buffer.from('x'),
  detectedMimeType: 'image/png',
} as unknown as ValidatedUploadedFile;

const baseOrder: BuyerProofOrder = {
  id: 'order-1',
  storeId: 'store-1',
  paymentStatus: 'PENDING_PAYMENT',
  fulfillmentStatus: 'ORDERING',
  requiredAmount: 100,
  currency: 'PEN',
  pendingAmount: 100,
  payments: [],
};

describe('BuyerPaymentProofService.submit', () => {
  let service: BuyerPaymentProofService;
  let upload: Mock;
  let tx: {
    $queryRaw: Mock;
    orderPayment: { findMany: Mock; create: Mock };
  };
  let events: { record: Mock };
  let notifications: { createIfNotOpen: Mock };

  beforeEach(() => {
    upload = vi.fn().mockResolvedValue('url');
    tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'order-1' }]),
      orderPayment: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({ id: 'payment-1' }),
      },
    };
    events = { record: vi.fn() };
    notifications = { createIfNotOpen: vi.fn() };
    service = new BuyerPaymentProofService(
      { $transaction: (cb: (t: unknown) => unknown) => cb(tx) } as never,
      { uploadPaymentImage: upload } as never,
      notifications as never,
      events as never,
    );
  });

  const submit = (
    order: Partial<BuyerProofOrder> = {},
    amount = '40',
    method = 'YAPE',
  ) =>
    service.submit({
      order: { ...baseOrder, ...order },
      file,
      amount,
      method,
      note: undefined,
    });

  it.each([
    [{ paymentStatus: 'CANCELLED' }, 'cancelada'],
    [{ paymentStatus: 'REJECTED' }, 'rechazada'],
    [{ paymentStatus: 'VERIFIED', pendingAmount: 0 }, 'ya está pagada'],
    [{ fulfillmentStatus: 'IN_TRANSIT' }, 'enviada'],
    [{ fulfillmentStatus: 'READY' }, 'enviada'],
    [{ fulfillmentStatus: 'COMPLETED' }, 'enviada'],
  ])('rejects %j without uploading', async (order, message) => {
    await expect(submit(order)).rejects.toThrow(message);
    expect(upload).not.toHaveBeenCalled();
  });

  it('still accepts a VERIFIED order with a residual balance', async () => {
    await expect(
      submit({ paymentStatus: 'VERIFIED', pendingAmount: 60 }),
    ).resolves.toEqual({ id: 'payment-1' });
  });

  it('rejects invalid amounts, methods and over-balance before uploading', async () => {
    await expect(submit({}, '0')).rejects.toThrow('Monto inválido');
    await expect(submit({}, 'abc')).rejects.toThrow('Monto inválido');
    await expect(submit({}, '101')).rejects.toThrow('excede el saldo');
    await expect(submit({}, '40', 'BITCOIN')).rejects.toThrow('método');
    expect(upload).not.toHaveBeenCalled();
  });

  it('counts pending proofs as reserved in the pre-check', async () => {
    await expect(
      submit(
        {
          payments: [{ amount: 80, reviewStatus: 'PENDING_REVIEW' }],
        },
        '30',
      ),
    ).rejects.toThrow('excede el saldo');
    expect(upload).not.toHaveBeenCalled();
  });

  it('re-checks the balance inside the lock', async () => {
    tx.orderPayment.findMany.mockResolvedValue([
      {
        amount: 90,
        source: 'BUYER_SUBMITTED',
        reviewStatus: 'PENDING_REVIEW',
        voidedAt: null,
      },
    ]);
    await expect(submit({}, '40')).rejects.toThrow('excede el saldo');
    expect(tx.orderPayment.create).not.toHaveBeenCalled();
    // The read only counts if it happens after the row lock.
    expect(tx.$queryRaw.mock.invocationCallOrder[0]).toBeLessThan(
      tx.orderPayment.findMany.mock.invocationCallOrder[0],
    );
  });

  it('creates the row, event and notification on success', async () => {
    await submit();
    expect(upload).toHaveBeenCalledWith(file.buffer, 'image/png');
    expect(tx.orderPayment.create.mock.calls[0][0].data).toMatchObject({
      orderId: 'order-1',
      storeId: 'store-1',
      source: 'BUYER_SUBMITTED',
      reviewStatus: 'PENDING_REVIEW',
      amount: 40,
      method: 'YAPE',
    });
    expect(events.record).toHaveBeenCalledWith(tx, {
      orderId: 'order-1',
      storeId: 'store-1',
      type: 'PAYMENT_SUBMITTED',
      actor: 'BUYER',
      payload: { paymentId: 'payment-1', amount: 40, method: 'YAPE' },
    });
    expect(notifications.createIfNotOpen).toHaveBeenCalledTimes(1);
    expect(notifications.createIfNotOpen).toHaveBeenCalledWith(
      expect.objectContaining({
        storeId: 'store-1',
        type: 'PAYMENT_PROOF_SUBMITTED',
        entityId: 'order-1',
      }),
      tx,
    );
  });
});
