import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { StorageService } from '../src/storage/storage.service.js';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { vi } from 'vitest';
import { AppModule } from './../src/app.module.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { OrderPaymentsService } from '../src/modules/orders/application/order-payments.service.js';
import {
  deleteOrders,
  mailerDevDir,
  waitForNewMailerFile,
} from './schema-assert.js';

// The buyer uploads a proof with nothing but the private link. Real
// AppModule, Postgres and MinIO: the unit specs mock the lock and the bucket.
describe('seller payments (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  let payments: OrderPaymentsService;
  let sessionCookie: string;
  let userId: string;
  const stores: {
    id: string;
    slug: string;
    productId: string;
    variantId: string;
  }[] = [];
  const orderIds: string[] = [];

  const runId = randomUUID();
  const email = `seller-pay-e2e-${runId}@example.com`;
  const customerPhone = '+51987654321';

  // 1x1 PNG, smallest valid file that passes the magic-byte check.
  const png = Buffer.from(
    '89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415478da6360606060000000050001a5f645400000000049454e44ae426082',
    'hex',
  );

  let ipCounter = 0;
  const nextIp = () => `192.0.2.${(ipCounter += 1)}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    // Production trusts one hop; the per-test X-Forwarded-For keeps the 10/min
    // upload throttle from colliding across tests.
    app.getHttpAdapter().getInstance().set('trust proxy', 1);
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    storage = moduleFixture.get(StorageService);
    payments = moduleFixture.get(OrderPaymentsService);

    const password = 'correcthorsebatterystaple';
    const existingMailerFiles = new Set(readdirSync(mailerDevDir));
    const signUpRes = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .send({ email, password, name: 'E2E Seller' })
      .expect(200);
    userId = signUpRes.body.user.id;
    const mailerFile = await waitForNewMailerFile(existingMailerFiles, email);
    const html = readFileSync(mailerFile, 'utf-8');
    const tokenMatch = html.match(/verify-email\?token=([^&"]+)/);
    if (!tokenMatch) throw new Error('verification link not found in email');
    await request(app.getHttpServer())
      .get(`/api/auth/verify-email?token=${tokenMatch[1]}`)
      .expect((res) => {
        if (res.status >= 400) throw new Error(`verify-email ${res.status}`);
      });
    const signInRes = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email, password })
      .expect(200);
    const setCookie = signInRes.headers['set-cookie'] as unknown as string[];
    const raw = setCookie?.find((c) => c.includes('session_token'));
    if (!raw) throw new Error('sign-in did not return a session cookie');
    sessionCookie = raw.split(';')[0]!;

    for (const label of ['a', 'b']) {
      const slug = `seller-pay-${label}-${runId}`;
      const storeRes = await request(app.getHttpServer())
        .post('/api/stores')
        .set('Cookie', sessionCookie)
        .send({
          name: `E2E Store ${label}`,
          slug,
          whatsappNumber: '+51900000000',
        })
        .expect(201);
      const productRes = await request(app.getHttpServer())
        .post(`/api/stores/${storeRes.body.id}/products`)
        .set('Cookie', sessionCookie)
        .send({ name: 'E2E Product', price: 25, currency: 'PEN', stock: 100 })
        .expect(201);
      await request(app.getHttpServer())
        .patch(
          `/api/stores/${storeRes.body.id}/products/${productRes.body.id}/publish`,
        )
        .set('Cookie', sessionCookie)
        .expect(200);
      stores.push({
        id: storeRes.body.id,
        slug,
        productId: productRes.body.id,
        variantId: productRes.body.variants[0].id,
      });
    }
  });

  afterAll(async () => {
    const ids = stores.map((s) => s.id);
    const proofs = await prisma.orderPayment.findMany({
      where: { storeId: { in: ids }, imageUrl: { not: null } },
      select: { imageUrl: true },
    });
    for (const proof of proofs) {
      await storage.deleteImage(proof.imageUrl!).catch(() => undefined);
    }
    for (const store of stores) {
      await prisma.orderPayment.deleteMany({ where: { storeId: store.id } });
      await prisma.orderItem.deleteMany({ where: { storeId: store.id } });
      await deleteOrders(prisma, { storeId: store.id });
      await prisma.notification.deleteMany({ where: { storeId: store.id } });
      await prisma.auditLog.deleteMany({ where: { storeId: store.id } });
      await prisma.customer.deleteMany({ where: { storeId: store.id } });
      await prisma.paymentMethodConfig.deleteMany({
        where: { storeId: store.id },
      });
      await prisma.deliveryMethodConfig.deleteMany({
        where: { storeId: store.id },
      });
      await prisma.productVariant.deleteMany({ where: { storeId: store.id } });
      await prisma.product.deleteMany({ where: { storeId: store.id } });
      await prisma.store.deleteMany({ where: { id: store.id } });
    }
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function newOrder(storeIndex = 0) {
    const store = stores[storeIndex]!;
    const res = await request(app.getHttpServer())
      .post(`/api/stores/${store.slug}/checkout`)
      .set('X-Forwarded-For', nextIp())
      .field('deliveryMethodType', 'PICKUP')
      .field('customerPhone', customerPhone)
      .field(
        'items',
        JSON.stringify([
          {
            productId: store.productId,
            variantId: store.variantId,
            quantity: 1,
          },
        ]),
      )
      .expect(201);
    const id = res.body.order.id as string;
    orderIds.push(id);
    const row = await prisma.order.findUniqueOrThrow({ where: { id } });
    return {
      id,
      storeId: store.id,
      requiredCents: Math.round(Number(row.requiredAmount) * 100),
    };
  }

  const addPayment = (
    storeId: string,
    orderId: string,
    fields: Record<string, string>,
    capture: Buffer | null = png,
  ) => {
    let req = request(app.getHttpServer())
      .post(`/api/stores/${storeId}/orders/${orderId}/payments`)
      .set('Cookie', sessionCookie)
      .set('X-Forwarded-For', nextIp());
    for (const [key, value] of Object.entries(fields)) {
      req = req.field(key, value);
    }
    return capture ? req.attach('file', capture, 'capture.png') : req;
  };

  const money = (cents: number) => (cents / 100).toFixed(2);

  it('stores operationCode, paidAt and recordedBy, and needs a capture unless CASH', async () => {
    const o = await newOrder();
    await addPayment(
      o.storeId,
      o.id,
      { amount: '1.00', method: 'YAPE' },
      null,
    ).expect(400);
    const res = await addPayment(o.storeId, o.id, {
      amount: '1.00',
      method: 'YAPE',
      operationCode: ' ab-12 ',
      paidAt: '2026-10-01T17:00:00.000Z',
      note: 'ok',
    }).expect(201);
    const row = await prisma.orderPayment.findFirstOrThrow({
      where: { orderId: o.id },
    });
    expect(row.operationCode).toBe('ab-12');
    expect(row.paidAt?.toISOString()).toBe('2026-10-01T17:00:00.000Z');
    expect(row.recordedBy).toBe(userId);
    expect(row.imageUrl).toBeTruthy();
    expect(res.body.id).toBe(o.id);

    const cash = await newOrder();
    await addPayment(
      cash.storeId,
      cash.id,
      { amount: '1.00', method: 'CASH' },
      null,
    ).expect(201);
  });

  it('rejects bad paidAt values and malformed amounts', async () => {
    const o = await newOrder();
    for (const paidAt of [
      '2026-10-01',
      '2026-10-01T10:00:00',
      'nope',
      '2999-01-01T00:00:00Z',
    ]) {
      await addPayment(o.storeId, o.id, {
        amount: '1.00',
        method: 'YAPE',
        paidAt,
      }).expect(400);
    }
    for (const amount of ['1e2', '0x10', '0.001', '0', '1,5']) {
      await addPayment(o.storeId, o.id, { amount, method: 'YAPE' }).expect(400);
    }
    expect(await prisma.orderPayment.count({ where: { orderId: o.id } })).toBe(
      0,
    );
  });

  it('answers a duplicate code with a 409 of exactly { code, orderId } and writes and uploads nothing', async () => {
    const a = await newOrder();
    const b = await newOrder();
    await addPayment(a.storeId, a.id, {
      amount: '1.00',
      method: 'YAPE',
      operationCode: 'OP-1234',
    }).expect(201);

    const uploadSpy = vi.spyOn(storage, 'uploadPaymentImage');
    const res = await addPayment(b.storeId, b.id, {
      amount: '1.00',
      method: 'YAPE',
      operationCode: 'op 1234',
    }).expect(409);
    expect(Object.keys(res.body).sort()).toEqual(['code', 'orderId']);
    expect(res.body).toEqual({
      code: 'DUPLICATE_OPERATION_CODE',
      orderId: a.id,
    });
    expect(uploadSpy).not.toHaveBeenCalled();
    expect(await prisma.orderPayment.count({ where: { orderId: b.id } })).toBe(
      0,
    );

    await addPayment(b.storeId, b.id, {
      amount: '1.00',
      method: 'YAPE',
      operationCode: 'op 1234',
      confirmDuplicate: 'true',
    }).expect(201);
  });

  it('never matches another store', async () => {
    const a = await newOrder(0);
    const other = await newOrder(1);
    await addPayment(a.storeId, a.id, {
      amount: '1.00',
      method: 'YAPE',
      operationCode: 'CROSS-1',
    }).expect(201);
    await addPayment(other.storeId, other.id, {
      amount: '1.00',
      method: 'YAPE',
      operationCode: 'CROSS-1',
    }).expect(201);
    expect(
      await payments.findDuplicateOperationCode(other.storeId, 'cross 1', {
        currentOrderId: 'x',
      }),
    ).toEqual({ orderId: other.id });
  });

  it('normalizes spaces, case, dashes and accents the same in SQL and TypeScript', async () => {
    const a = await newOrder();
    const s = a.storeId;
    const store = (operationCode: string) =>
      prisma.orderPayment.create({
        data: {
          orderId: a.id,
          storeId: s,
          amount: 1,
          currency: 'PEN',
          method: 'YAPE',
          source: 'SELLER_RECORDED',
          reviewStatus: 'N_A',
          operationCode,
        },
      });
    await store('Ab 12-Cd');
    await store('CAFÉ-1');
    const find = (code: string) =>
      payments.findDuplicateOperationCode(s, code, { currentOrderId: 'other' });
    expect(await find('AB12CD')).toEqual({ orderId: a.id });
    expect(await find(' ab-12 cd')).toEqual({ orderId: a.id });
    // The accent drops out on both sides, so these collide by design.
    expect(await find('CAF1')).toEqual({ orderId: a.id });
    expect(await find('---')).toBeNull();
    expect(await find('ÁÉ')).toBeNull();
  });

  it('stores a fullwidth code NFKC-normalized so the ASCII lookup finds it, and the reverse', async () => {
    const a = await newOrder();
    await addPayment(a.storeId, a.id, {
      amount: '1.00',
      method: 'YAPE',
      operationCode: 'ＸＹ-７７',
    }).expect(201);
    const row = await prisma.orderPayment.findFirstOrThrow({
      where: { orderId: a.id },
    });
    expect(row.operationCode).toBe('XY-77');
    const find = (code: string) =>
      payments.findDuplicateOperationCode(a.storeId, code, {
        currentOrderId: 'other',
      });
    expect(await find('xy77')).toEqual({ orderId: a.id });
    expect(await find('ＸＹ７７')).toEqual({ orderId: a.id });
  });

  it('ignores voided payments, rejected proofs and pending proofs of the same order', async () => {
    const a = await newOrder();
    const b = await newOrder();
    const base = {
      storeId: a.storeId,
      amount: 1,
      currency: 'PEN',
      method: 'YAPE' as const,
    };
    await prisma.orderPayment.create({
      data: {
        ...base,
        orderId: a.id,
        source: 'SELLER_RECORDED',
        reviewStatus: 'N_A',
        operationCode: 'VOID-1',
        voidedAt: new Date(),
      },
    });
    await prisma.orderPayment.create({
      data: {
        ...base,
        orderId: a.id,
        source: 'BUYER_SUBMITTED',
        reviewStatus: 'REJECTED',
        operationCode: 'REJ-1',
      },
    });
    await prisma.orderPayment.create({
      data: {
        ...base,
        orderId: b.id,
        source: 'BUYER_SUBMITTED',
        reviewStatus: 'PENDING_REVIEW',
        operationCode: 'PEND-1',
      },
    });
    const find = (code: string, currentOrderId: string) =>
      payments.findDuplicateOperationCode(a.storeId, code, { currentOrderId });
    expect(await find('void1', b.id)).toBeNull();
    expect(await find('rej1', b.id)).toBeNull();
    expect(await find('pend1', b.id)).toBeNull(); // same order
    expect(await find('pend1', a.id)).toEqual({ orderId: b.id }); // another order
  });

  it('cannot exceed pending minus buyer proofs in review, then approving the proof settles the order', async () => {
    const o = await newOrder();
    const proof = await prisma.orderPayment.create({
      data: {
        orderId: o.id,
        storeId: o.storeId,
        amount: money(o.requiredCents - 100),
        currency: 'PEN',
        method: 'YAPE',
        source: 'BUYER_SUBMITTED',
        reviewStatus: 'PENDING_REVIEW',
      },
    });
    const tooMuch = await addPayment(o.storeId, o.id, {
      amount: '1.01',
      method: 'YAPE',
    }).expect(400);
    expect(tooMuch.body.message).toContain('Rechaza o valida');
    await addPayment(o.storeId, o.id, {
      amount: '1.00',
      method: 'YAPE',
    }).expect(201);

    const reviewed = await request(app.getHttpServer())
      .patch(
        `/api/stores/${o.storeId}/orders/${o.id}/payments/${proof.id}/review`,
      )
      .set('Cookie', sessionCookie)
      .send({ decision: 'approve' })
      .expect(200);
    expect(reviewed.body.paymentStatus).toBe('VERIFIED');
  });

  it('refuses to approve a proof that would overshoot, or one on a cancelled order', async () => {
    const o = await newOrder();
    await addPayment(
      o.storeId,
      o.id,
      { amount: money(o.requiredCents), method: 'CASH' },
      null,
    ).expect(201);
    const proof = await prisma.orderPayment.create({
      data: {
        orderId: o.id,
        storeId: o.storeId,
        amount: 5,
        currency: 'PEN',
        method: 'YAPE',
        source: 'BUYER_SUBMITTED',
        reviewStatus: 'PENDING_REVIEW',
      },
    });
    const review = (orderId: string, storeId: string, paymentId: string) =>
      request(app.getHttpServer())
        .patch(
          `/api/stores/${storeId}/orders/${orderId}/payments/${paymentId}/review`,
        )
        .set('Cookie', sessionCookie)
        .send({ decision: 'approve' });
    await review(o.id, o.storeId, proof.id).expect(400);
    expect(
      (await prisma.orderPayment.findUniqueOrThrow({ where: { id: proof.id } }))
        .reviewStatus,
    ).toBe('PENDING_REVIEW');

    const dead = await newOrder();
    const deadProof = await prisma.orderPayment.create({
      data: {
        orderId: dead.id,
        storeId: dead.storeId,
        amount: 1,
        currency: 'PEN',
        method: 'YAPE',
        source: 'BUYER_SUBMITTED',
        reviewStatus: 'PENDING_REVIEW',
      },
    });
    await prisma.order.update({
      where: { id: dead.id },
      data: { status: 'CANCELLED', paymentStatus: 'CANCELLED' },
    });
    await review(dead.id, dead.storeId, deadProof.id).expect(400);
    expect(
      (
        await prisma.orderPayment.findUniqueOrThrow({
          where: { id: deadProof.id },
        })
      ).reviewStatus,
    ).toBe('PENDING_REVIEW');
  });
});
