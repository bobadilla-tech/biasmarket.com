import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createHash, randomInt, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AssistedOrderIdentityRetentionUseCase } from '../src/modules/orders/application/assisted-order-identity-retention.usecase.js';
import { AppModule } from './../src/app.module.js';
import {
  deleteOrders,
  mailerDevDir,
  waitForNewMailerFile,
} from './schema-assert.js';

// Seller-assisted order creation (POST /stores/:storeId/orders/assisted):
// ownership, validation, privacy of the link token, Customer upsert without a
// BuyerAccount, and the checkout-vs-assisted lock-order race (40P01 when the
// two flows lock Customer and stock in opposite orders).
describe('assisted orders (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const password = 'correcthorsebatterystaple';
  const userIds: string[] = [];
  let sellerCookie: string;
  let otherCookie: string;
  let storeId: string;
  let storeSlug: string;
  let otherStoreId: string;
  let productId: string;
  let variantId: string;
  let otherProductId: string;
  let otherVariantId: string;
  let ipCounter = 0;
  const extraStoreIds: string[] = [];
  // Fresh numbers per run so a reused database never finds the checkout's
  // BuyerAccount (which would skip the Customer upsert under test).
  const racePhones = Array.from(
    { length: 5 },
    () => `+519${String(randomInt(1e8)).padStart(8, '0')}`,
  );

  const nextIp = () => `198.51.101.${++ipCounter}`;

  async function signUp(label: string): Promise<string> {
    const email = `assisted-${label}-${runId}@example.com`;
    const existing = new Set(readdirSync(mailerDevDir));
    const res = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password, name: `Seller ${label}` })
      .expect(200);
    userIds.push(res.body.user.id);
    const html = readFileSync(
      await waitForNewMailerFile(existing, email, 20_000),
      'utf-8',
    );
    const token = html.match(/verify-email\?token=([^&"]+)/)?.[1];
    if (!token) throw new Error('verification link not found in email');
    await request(app.getHttpServer()).get(
      `/api/auth/verify-email?token=${token}`,
    );
    const signIn = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .set('X-Forwarded-For', nextIp())
      .send({ email, password })
      .expect(200);
    const raw = (signIn.headers['set-cookie'] as unknown as string[]).find(
      (c) => c.includes('session_token'),
    );
    if (!raw) throw new Error('sign-in did not return a session cookie');
    return raw.split(';')[0]!;
  }

  async function seedStore(cookie: string, slug: string, price = 25) {
    const store = await request(app.getHttpServer())
      .post('/stores')
      .set('Cookie', cookie)
      .send({ name: slug, slug, whatsappNumber: '+51900000000' })
      .expect(201);
    const product = await request(app.getHttpServer())
      .post(`/stores/${store.body.id}/products`)
      .set('Cookie', cookie)
      .send({ name: 'Album', price, currency: 'PEN', stock: 50 })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/stores/${store.body.id}/products/${product.body.id}/publish`)
      .set('Cookie', cookie)
      .expect(200);
    return {
      storeId: store.body.id as string,
      productId: product.body.id as string,
      variantId: product.body.variants[0].id as string,
    };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    // Same global pipe as main.ts, which the e2e bootstrap does not install.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    sellerCookie = await signUp('a');
    otherCookie = await signUp('b');
    storeSlug = `assisted-a-${runId}`;
    ({ storeId, productId, variantId } = await seedStore(
      sellerCookie,
      storeSlug,
    ));
    extraStoreIds.push(storeId);
    ({
      storeId: otherStoreId,
      productId: otherProductId,
      variantId: otherVariantId,
    } = await seedStore(otherCookie, `assisted-b-${runId}`));
  });

  afterAll(async () => {
    for (const id of [storeId, otherStoreId, ...extraStoreIds].filter(
      Boolean,
    )) {
      await prisma.orderItem.deleteMany({ where: { storeId: id } });
      await deleteOrders(prisma, { storeId: id });
      await prisma.auditLog.deleteMany({ where: { storeId: id } });
      await prisma.customerStoreLink.deleteMany({ where: { storeId: id } });
      await prisma.customer.deleteMany({ where: { storeId: id } });
      await prisma.productVariant.deleteMany({ where: { storeId: id } });
      await prisma.product.deleteMany({ where: { storeId: id } });
      await prisma.notification.deleteMany({ where: { storeId: id } });
      await prisma.paymentMethodConfig.deleteMany({ where: { storeId: id } });
      await prisma.deliveryMethodConfig.deleteMany({ where: { storeId: id } });
      await prisma.store.deleteMany({ where: { id } });
    }
    await prisma.buyerAccount.deleteMany({
      where: {
        OR: [
          { phone: { in: racePhones } },
          { email: { startsWith: 'race-', endsWith: `-${runId}@example.com` } },
        ],
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  const body = (overrides: Record<string, unknown> = {}) => ({
    deliveryMethodType: 'PICKUP',
    customerPhone: '987 654 321',
    items: [{ productId, variantId, quantity: 2 }],
    ...overrides,
  });

  const post = (
    payload: Record<string, unknown>,
    cookie = sellerCookie,
    target = storeId,
  ) =>
    request(app.getHttpServer())
      .post(`/stores/${target}/orders/assisted`)
      .set('Cookie', cookie)
      .send(payload);

  const variantRow = (id: string) =>
    prisma.productVariant.findUniqueOrThrow({ where: { id } });

  it('creates an assisted order with a private link that works publicly', async () => {
    const before = await variantRow(variantId);
    const res = await post(body({ customerName: 'Sofi' })).expect(201);

    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.body.order.source).toBe('VENDOR_ASSISTED');
    expect(res.body.order.customerPhone).toBe('+51987654321');
    // The buyer's account id never reaches the seller (#379).
    expect(res.body.order).not.toHaveProperty('buyerAccountId');
    expect(res.body.order.totalAmount).toBe('50');
    expect(res.body.previousOrders).toBe(0);

    const url = new URL(res.body.accessUrl);
    const token = url.pathname.split('/').pop()!;
    expect(url.search).toBe('');
    expect(url.pathname).toBe(`/es/store/${storeSlug}/pedido/${token}`);
    expect(token.length).toBeGreaterThanOrEqual(43);

    const row = await prisma.order.findUniqueOrThrow({
      where: { id: res.body.order.id },
    });
    expect(row.accessTokenHash).toBe(
      createHash('sha256').update(token).digest('hex'),
    );
    expect(row.accessTokenHash).not.toBe(token);
    expect(row.createdByUserId).toBe(userIds[0]);
    expect(row.customerPhoneNormalized).toBe('+51987654321');
    expect(row.accessTokenRevokedAt).toBeNull();
    const hold = row.expiresAt.getTime() - row.createdAt.getTime();
    expect(Math.abs(hold - 48 * 3_600_000)).toBeLessThan(60_000);

    const after = await variantRow(variantId);
    expect(after.reserved - before.reserved).toBe(2);

    // No BuyerAccount / CustomerStoreLink, no email on the contact.
    expect(
      await prisma.buyerAccount.count({ where: { phone: row.customerPhone } }),
    ).toBe(0);
    expect(await prisma.customerStoreLink.count({ where: { storeId } })).toBe(
      0,
    );
    const customer = await prisma.customer.findUniqueOrThrow({
      where: { storeId_phone: { storeId, phone: '+51987654321' } },
    });
    expect(customer.id).toBe(row.customerId);
    expect(customer.email).toBeNull();
    expect(customer.name).toBe('Sofi');

    // Audit trail and event stay free of phone, token and alias.
    const events = await prisma.orderEvent.findMany({
      where: { orderId: row.id },
    });
    expect(events.map((e) => e.type)).toEqual(['CREATED']);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { entityId: row.id, action: 'order.assisted_created' },
    });
    expect(audit.metadata).toEqual({
      source: 'VENDOR_ASSISTED',
      itemCount: 1,
      deliveryMethodType: 'PICKUP',
      paymentMethod: null,
    });
    const serialized = JSON.stringify([
      audit.metadata,
      events.map((e) => e.payload),
    ]);
    expect(serialized).not.toMatch(/\d{8,}/);
    expect(serialized).not.toContain(token);
    expect(serialized).not.toContain('Sofi');

    const publicRes = await request(app.getHttpServer())
      .get(`/public/orders/${token}`)
      .set('X-Forwarded-For', nextIp())
      .expect(200);
    // The sanitised alias is the one place the name is public.
    expect(publicRes.body.customerAlias).toBe('Sofi');
    expect(JSON.stringify(publicRes.body).split('Sofi')).toHaveLength(2);
  });

  it('rejects invalid input', async () => {
    await post(body({ customerPhone: '' })).expect(400);
    await post(body({ customerPhone: 'abc' })).expect(400);
    await post(body({ customerPhone: '12345' })).expect(400);
    await post(body({ customerName: 'x'.repeat(61) })).expect(400);
    await post(body({ customerName: 'bad\u0000name' })).expect(400);
    await post(body({ customerName: 'bad\u202Ename' })).expect(400);
    await post(body({ customerName: 'bad\u200Bname' })).expect(400);
    await post(body({ customerName: 'bad\u2028name' })).expect(400);
    await post(body({ items: [{ productId, variantId, quantity: 0 }] })).expect(
      400,
    );
    await post(body({ items: [] })).expect(400);
    for (const extra of [
      { source: 'MARKETPLACE' },
      { createdByUserId: userIds[0] },
      { customerEmail: 'a@b.com' },
      { expiresAt: '2030-01-01T00:00:00.000Z' },
      { storeId: otherStoreId },
    ]) {
      await post(body(extra)).expect(400);
    }
  });

  it('enforces ownership and tenant isolation', async () => {
    await post(body(), otherCookie).expect(403);
    await post(body(), sellerCookie, 'does-not-exist').expect(404);
    await request(app.getHttpServer())
      .post(`/stores/${storeId}/orders/assisted`)
      .send(body())
      .expect(401);
    // A product of another store is unavailable, and nothing is reserved.
    const before = await variantRow(otherVariantId);
    await post(
      body({
        items: [
          { productId: otherProductId, variantId: otherVariantId, quantity: 1 },
        ],
      }),
    ).expect(400);
    expect((await variantRow(otherVariantId)).reserved).toBe(before.reserved);
  });

  // The seller route allows 20 requests/min per user (20 is a hard cap, 4xx
  // included), so the remaining cases run as a fresh seller on a fresh store.
  describe('as a second seller', () => {
    beforeAll(async () => {
      sellerCookie = await signUp('c');
      storeSlug = `assisted-c-${runId}`;
      ({ storeId, productId, variantId } = await seedStore(
        sellerCookie,
        storeSlug,
      ));
      extraStoreIds.push(storeId);
    });

    it('releases stock when stock is short or the total is 0', async () => {
      const before = await variantRow(variantId);
      await post(
        body({
          items: [{ productId, variantId, quantity: before.stock! + 1 }],
        }),
      ).expect(400);
      expect((await variantRow(variantId)).reserved).toBe(before.reserved);

      const free = await seedFreeProduct();
      const freeBefore = await variantRow(free.variantId);
      await post(
        body({
          items: [
            {
              productId: free.productId,
              variantId: free.variantId,
              quantity: 1,
            },
          ],
        }),
      ).expect(400);
      expect((await variantRow(free.variantId)).reserved).toBe(
        freeBefore.reserved,
      );
    });

    async function seedFreeProduct() {
      const product = await request(app.getHttpServer())
        .post(`/stores/${storeId}/products`)
        .set('Cookie', sellerCookie)
        .send({ name: 'Free', price: 0, currency: 'PEN', stock: 5 })
        .expect(201);
      await request(app.getHttpServer())
        .patch(`/stores/${storeId}/products/${product.body.id}/publish`)
        .set('Cookie', sellerCookie)
        .expect(200);
      return {
        productId: product.body.id as string,
        variantId: product.body.variants[0].id as string,
      };
    }

    it('keeps an existing contact name and never touches a registered buyer', async () => {
      const phone = '+51911222333';
      const seeded = await prisma.customer.create({
        data: {
          storeId,
          phone,
          name: 'Registered Name',
          email: 'buyer@example.com',
          emailVerified: true,
          passwordHash: 'hash',
        },
      });
      const res = await post(
        body({ customerPhone: phone, customerName: 'Alias' }),
      ).expect(201);
      expect(res.body.order.customerId).toBe(seeded.id);
      const after = await prisma.customer.findUniqueOrThrow({
        where: { id: seeded.id },
      });
      expect(after).toEqual(seeded);
      expect(res.body.order.customerName).toBe('Alias');
    });

    it('counts previous orders across phone formats and never other stores', async () => {
      const phone = '+51944555666';
      const legacy = (customerPhone: string, normalized: string | null) =>
        prisma.order.create({
          data: {
            storeId,
            customerPhone,
            customerPhoneNormalized: normalized,
            deliveryMethodType: 'PICKUP',
            deliveryDetails: {},
            totalAmount: 10,
            requiredAmount: 10,
            currency: 'PEN',
            expiresAt: new Date(Date.now() + 3_600_000),
          },
        });
      await legacy('944555666', null);
      await legacy('51944555666', null);
      await legacy(phone, phone);
      await prisma.order.create({
        data: {
          storeId: otherStoreId,
          customerPhone: phone,
          customerPhoneNormalized: phone,
          deliveryMethodType: 'PICKUP',
          deliveryDetails: {},
          totalAmount: 10,
          requiredAmount: 10,
          currency: 'PEN',
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      });
      // Same legacy shape in another store: the unindexed branch must also
      // filter by storeId.
      await prisma.order.create({
        data: {
          storeId: otherStoreId,
          customerPhone: '944555666',
          customerPhoneNormalized: null,
          deliveryMethodType: 'PICKUP',
          deliveryDetails: {},
          totalAmount: 10,
          requiredAmount: 10,
          currency: 'PEN',
          expiresAt: new Date(Date.now() + 3_600_000),
        },
      });
      const res = await post(body({ customerPhone: '944 555 666' })).expect(
        201,
      );
      expect(res.body.previousOrders).toBe(3);
    });

    it('throttles per signed-in user, not per IP', async () => {
      const cookieC = await signUp('throttle');
      const cookieD = otherCookie;
      const ip = nextIp();
      const attempt = (cookie: string) =>
        request(app.getHttpServer())
          .post(`/stores/${storeId}/orders/assisted`)
          .set('Cookie', cookie)
          .set('X-Forwarded-For', ip)
          .send(body());
      // Not the owner: 403 each time, which still counts toward the bucket.
      for (let i = 0; i < 20; i++) await attempt(cookieC).expect(403);
      await attempt(cookieC).expect(429);
      // The other seller (barely used so far) behind the same IP has their
      // own bucket.
      await attempt(cookieD).expect(403);
    }, 30_000);

    it('survives concurrent creates for the same new phone', async () => {
      const phone = '+51955000111';
      const results = await Promise.all(
        [1, 2, 3, 4].map(() => post(body({ customerPhone: phone }))),
      );
      expect(results.map((r) => r.status)).toEqual([201, 201, 201, 201]);
      expect(await prisma.customer.count({ where: { storeId, phone } })).toBe(
        1,
      );
    });

    it('does not deadlock against a concurrent checkout for the same phone and product', async () => {
      const checkout = (phone: string) =>
        request(app.getHttpServer())
          .post(`/stores/${storeSlug}/checkout`)
          .set('X-Forwarded-For', nextIp())
          .field('deliveryMethodType', 'PICKUP')
          .field('customerPhone', phone)
          .field('customerEmail', `race-${ipCounter}-${runId}@example.com`)
          .field(
            'items',
            JSON.stringify([{ productId, variantId, quantity: 1 }]),
          );

      for (let i = 0; i < 5; i++) {
        const phone = racePhones[i]!;
        // The checkout's own Customer create-if-missing is a separate, older
        // race (P2002 when two requests create the same new phone), so the
        // contact exists up front. A null name makes the assisted flow update
        // the row too, which is the Customer-then-stock ordering under test.
        await prisma.customer.create({ data: { storeId, phone } });
        const [assisted, checkoutRes] = await Promise.all([
          post(
            body({
              customerPhone: phone,
              customerName: 'Race',
              items: [{ productId, variantId, quantity: 1 }],
            }),
          ),
          checkout(phone),
        ]);
        expect(assisted.status).toBe(201);
        expect(checkoutRes.status).toBe(201);
      }
    });
  });

  // The seller routes allow 20 requests/min per user (4xx included), so this
  // runs as a fresh seller on a fresh store.
  describe('buyer notices, as a third seller', () => {
    let noticeCookie: string;
    let noticeStoreId: string;
    let noticeOrderId: string;
    let noticeHashBefore: string | null;

    beforeAll(async () => {
      noticeCookie = await signUp('d');
      ({
        storeId: noticeStoreId,
        productId,
        variantId,
      } = await seedStore(noticeCookie, `assisted-d-${runId}`));
      extraStoreIds.push(noticeStoreId);
      const created = await post(body(), noticeCookie, noticeStoreId).expect(
        201,
      );
      noticeOrderId = created.body.order.id;
      noticeHashBefore = (
        await prisma.order.findUniqueOrThrow({ where: { id: noticeOrderId } })
      ).accessTokenHash;
    });

    const notify = (
      payload: Record<string, unknown>,
      cookie = noticeCookie,
      target = noticeStoreId,
      orderId = noticeOrderId,
    ) =>
      request(app.getHttpServer())
        .post(`/stores/${target}/orders/${orderId}/buyer-notices`)
        .set('Cookie', cookie)
        .send(payload);

    it('logs BUYER_NOTIFIED with only the notice, and never touches the link', async () => {
      await notify({ notice: 'ASSISTED_IN_TRANSIT' }).expect(204);

      const events = await prisma.orderEvent.findMany({
        where: { orderId: noticeOrderId, type: 'BUYER_NOTIFIED' },
      });
      expect(events).toHaveLength(1);
      expect(events[0]!.actor).toBe('SELLER');
      expect(events[0]!.payload).toEqual({ notice: 'ASSISTED_IN_TRANSIT' });

      const row = await prisma.order.findUniqueOrThrow({
        where: { id: noticeOrderId },
      });
      expect(row.accessTokenHash).toBe(noticeHashBefore);
      expect(row.accessTokenRevokedAt).toBeNull();
    });

    it('rejects an unknown notice, another seller, a foreign store and no session', async () => {
      await notify({ notice: 'NOPE' }).expect(400);
      await notify({ notice: 'ASSISTED_READY' }, otherCookie).expect(403);
      await notify(
        { notice: 'ASSISTED_READY' },
        noticeCookie,
        noticeStoreId,
        'does-not-exist',
      ).expect(404);
      await request(app.getHttpServer())
        .post(`/stores/${noticeStoreId}/orders/${noticeOrderId}/buyer-notices`)
        .send({ notice: 'ASSISTED_READY' })
        .expect(401);
      expect(
        await prisma.orderEvent.count({
          where: { orderId: noticeOrderId, type: 'BUYER_NOTIFIED' },
        }),
      ).toBe(1);
    });
  });

  it(
    'keeps a shared Customer while another assisted order is active, then erases it after closure',
    async () => {
    const sharedPhone = `+519${String(randomInt(1e8)).padStart(8, '0')}`;
    const first = await post(body({ customerPhone: sharedPhone })).expect(201);
    const second = await post(body({ customerPhone: sharedPhone })).expect(201);
    const firstRow = await prisma.order.findUniqueOrThrow({
      where: { id: first.body.order.id },
    });
    const secondRow = await prisma.order.findUniqueOrThrow({
      where: { id: second.body.order.id },
    });
    const customerId = firstRow.customerId!;
    expect(secondRow.customerId).toBe(customerId);

    await prisma.order.update({
      where: { id: first.body.order.id },
      data: { status: 'CANCELLED', closedAt: new Date() },
    });

    const retention = app.get(AssistedOrderIdentityRetentionUseCase);
    const firstPass = await retention.eraseOnBuyerRequest(
      storeId,
      sharedPhone,
      'support-operator-1',
      'PRIV-460',
    );
    expect(firstPass).toEqual({ anonymized: 1, deferred: 1 });

    const customerAfterFirstPass = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
    });
    expect(customerAfterFirstPass.phone).toBe(sharedPhone);
    expect(customerAfterFirstPass.identityErasedAt).toBeNull();

    await prisma.order.update({
      where: { id: second.body.order.id },
      data: { status: 'CANCELLED', closedAt: new Date() },
    });
    const secondPass = await retention.eraseOnBuyerRequest(
      storeId,
      sharedPhone,
      'support-operator-1',
      'PRIV-460',
    );
    expect(secondPass).toEqual({ anonymized: 1, deferred: 0 });

    const erasedCustomer = await prisma.customer.findUniqueOrThrow({
      where: { id: customerId },
    });
    expect(erasedCustomer.phone).toBe(`erased:${customerId}`);
    expect(erasedCustomer.identityErasedAt).toBeInstanceOf(Date);
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: {
        entityId: second.body.order.id,
        action: 'order.assisted_identity_erased',
      },
    });
    expect(audit.actorId).toBe('support-operator-1');
    expect(audit.metadata).toMatchObject({
      cause: 'BUYER_REQUEST',
      requestReference: 'PRIV-460',
    });
    },
  );
});

