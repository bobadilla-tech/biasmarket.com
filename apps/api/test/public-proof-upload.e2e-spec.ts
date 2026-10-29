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
import { createOrderAccessToken } from '@biasmarket/utils/assisted-order';
import {
  deleteOrders,
  mailerDevDir,
  waitForNewMailerFile,
} from './schema-assert.js';

// The buyer uploads a proof with nothing but the private link. Real
// AppModule, Postgres and MinIO: the unit specs mock the lock and the bucket.
describe('public proof upload (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageService;
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
  const email = `public-proof-e2e-${runId}@example.com`;
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
      const slug = `public-proof-${label}-${runId}`;
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

  async function assistedOrder(
    storeIndex = 0,
    patch: Record<string, unknown> = {},
  ) {
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
    const { token, tokenHash } = createOrderAccessToken();
    await prisma.order.update({
      where: { id },
      data: { accessTokenHash: tokenHash, ...patch },
    });
    return { id, token, storeId: store.id };
  }

  const upload = (
    token: string,
    fields: Record<string, string> = { amount: '10.00', method: 'YAPE' },
  ) => {
    let req = request(app.getHttpServer())
      .post(`/api/public/orders/${token}/payments`)
      .set('X-Forwarded-For', nextIp());
    for (const [key, value] of Object.entries(fields))
      req = req.field(key, value);
    return req.attach('file', png, 'proof.png');
  };

  it('stores a pending buyer proof, an event and a notification, and serves the image', async () => {
    const { id, token, storeId } = await assistedOrder();
    const before = await prisma.order.findUniqueOrThrow({ where: { id } });

    const res = await upload(token, {
      amount: '10.00',
      method: 'YAPE',
      note: 'gracias',
      operationCode: ' ＯＰ-123 ',
    }).expect(201);
    expect(Object.keys(res.body).sort()).toEqual([
      'amount',
      'createdAt',
      'id',
      'reviewStatus',
    ]);
    expect(res.headers['cache-control']).toBe('no-store');

    const row = await prisma.orderPayment.findUniqueOrThrow({
      where: { id: res.body.id },
    });
    expect(row).toMatchObject({
      orderId: id,
      storeId,
      source: 'BUYER_SUBMITTED',
      reviewStatus: 'PENDING_REVIEW',
      paidAt: null,
      operationCode: 'OP-123',
      note: 'gracias',
    });
    expect(Number(row.amount)).toBe(10);

    const after = await prisma.order.findUniqueOrThrow({ where: { id } });
    expect(after.paymentStatus).toBe(before.paymentStatus);

    const event = await prisma.orderEvent.findFirstOrThrow({
      where: { orderId: id, type: 'PAYMENT_SUBMITTED' },
    });
    expect(event.actor).toBe('BUYER');
    expect(Object.keys(event.payload as object).sort()).toEqual([
      'amount',
      'method',
      'paymentId',
    ]);
    expect(JSON.stringify(event.payload)).not.toContain('OP-123');
    const notifications = await prisma.notification.findMany({
      where: { storeId, type: 'PAYMENT_PROOF_SUBMITTED', entityId: id },
    });
    expect(notifications).toHaveLength(1);
    expect(JSON.stringify(notifications)).not.toContain('OP-123');

    const page = await request(app.getHttpServer())
      .get(`/api/public/orders/${token}`)
      .expect(200);
    const listed = page.body.payments.find(
      (p: { id: string }) => p.id === row.id,
    );
    expect(listed).toMatchObject({
      hasProof: true,
      reviewStatus: 'PENDING_REVIEW',
    });
    expect(JSON.stringify(page.body)).not.toContain('OP-123');
    expect(JSON.stringify(page.body)).not.toContain(row.imageUrl!);

    const image = await request(app.getHttpServer())
      .get(`/api/public/orders/${token}/payments/${row.id}/image`)
      .set('X-Forwarded-For', nextIp())
      .expect(200);
    expect(image.headers['content-type']).toContain('image/png');
    expect(image.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(image.headers['x-content-type-options']).toBe('nosniff');
    expect(image.headers['cache-control']).toBe('private, no-store');
    expect(Buffer.from(image.body).equals(png)).toBe(true);
  });

  it('answers unknown, revoked and malformed tokens with the same 404, even with a bad file', async () => {
    const { id, token } = await assistedOrder();
    await prisma.order.update({
      where: { id },
      data: { accessTokenRevokedAt: new Date() },
    });
    const unknown = createOrderAccessToken().token;
    const get = await request(app.getHttpServer())
      .get(`/api/public/orders/${unknown}`)
      .expect(404);
    const uploadSpy = vi.spyOn(storage, 'uploadPaymentImage');

    for (const candidate of [unknown, token]) {
      const res = await request(app.getHttpServer())
        .post(`/api/public/orders/${candidate}/payments`)
        .set('X-Forwarded-For', nextIp())
        .field('amount', '10')
        .attach('file', Buffer.from('MZ not an image'), 'x.exe');
      expect(res.status).toBe(404);
      expect(res.body.message).toBe(get.body.message);
      expect(JSON.stringify(res.body)).not.toContain(candidate);
    }
    await request(app.getHttpServer())
      .post(`/api/public/orders/${unknown}/payments`)
      .set('X-Forwarded-For', nextIp())
      .send({ amount: '10' })
      .expect(404);
    expect(uploadSpy).not.toHaveBeenCalled();
  });

  it('answers 415 for a non-multipart body on a valid token', async () => {
    const { token } = await assistedOrder();
    await request(app.getHttpServer())
      .post(`/api/public/orders/${token}/payments`)
      .set('X-Forwarded-For', nextIp())
      .send({ amount: '10' })
      .expect(415);
  });

  it.each([
    ['cancelled', { status: 'CANCELLED', paymentStatus: 'CANCELLED' }],
    ['rejected', { paymentStatus: 'REJECTED' }],
    ['shipped', { fulfillmentStatus: 'IN_TRANSIT' }],
    ['expired but not swept', { expiresAt: new Date('2020-01-01T00:00:00Z') }],
  ])(
    'rejects an %s order with a 400, no row and no upload',
    async (_n, patch) => {
      const { id, token } = await assistedOrder(0, patch);
      const uploadSpy = vi.spyOn(storage, 'uploadPaymentImage');
      await upload(token).expect(400);
      expect(uploadSpy).not.toHaveBeenCalled();
      expect(await prisma.orderPayment.count({ where: { orderId: id } })).toBe(
        0,
      );
    },
  );

  it('rejects an amount over the balance and malformed amounts', async () => {
    const { id, token } = await assistedOrder();
    const order = await prisma.order.findUniqueOrThrow({ where: { id } });
    const over = (Number(order.requiredAmount) + 0.01).toFixed(2);
    await upload(token, { amount: over, method: 'YAPE' }).expect(400);
    for (const amount of ['1e2', '0x10', '0.001', '0', '-1', '1,5']) {
      await upload(token, { amount, method: 'YAPE' }).expect(400);
    }
    expect(await prisma.orderPayment.count({ where: { orderId: id } })).toBe(0);
  });

  it('caps pending proofs at 5: six parallel one-cent proofs create exactly 5 rows and clean up the 6th upload', async () => {
    const { id, token } = await assistedOrder();
    const deleteSpy = vi.spyOn(storage, 'deleteImage');
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        upload(token, { amount: '0.01', method: 'YAPE' }),
      ),
    );
    const statuses = results.map((r) => r.status).sort();
    expect(statuses).toEqual([201, 201, 201, 201, 201, 400]);
    expect(await prisma.orderPayment.count({ where: { orderId: id } })).toBe(5);
    expect(deleteSpy).toHaveBeenCalledTimes(1);
  });

  it('parallel full-balance proofs never exceed the balance: exactly one wins', async () => {
    const { id, token } = await assistedOrder();
    const order = await prisma.order.findUniqueOrThrow({ where: { id } });
    const full = Number(order.requiredAmount).toFixed(2);
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        upload(token, { amount: full, method: 'YAPE' }),
      ),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(results.filter((r) => r.status === 400)).toHaveLength(2);
    expect(await prisma.orderPayment.count({ where: { orderId: id } })).toBe(1);
  });

  it('is isolated per order and store: other ids and seller captures all 404 the same', async () => {
    const a = await assistedOrder(0);
    const b = await assistedOrder(1);
    const bUpload = await upload(b.token).expect(201);
    const sellerRow = await prisma.orderPayment.create({
      data: {
        orderId: a.id,
        storeId: a.storeId,
        amount: 5,
        currency: 'PEN',
        method: 'YAPE',
        source: 'SELLER_RECORDED',
        reviewStatus: 'N_A',
        imageUrl: 'https://example.invalid/seller.png',
      },
    });

    const image = (token: string, paymentId: string) =>
      request(app.getHttpServer())
        .get(`/api/public/orders/${token}/payments/${paymentId}/image`)
        .set('X-Forwarded-For', nextIp());

    const crossStore = await image(a.token, bUpload.body.id).expect(404);
    const seller = await image(a.token, sellerRow.id).expect(404);
    const missing = await image(a.token, 'does-not-exist').expect(404);
    expect(seller.body.message).toBe(crossStore.body.message);
    expect(missing.body.message).toBe(crossStore.body.message);
    await image(b.token, bUpload.body.id).expect(200);
  });
});
