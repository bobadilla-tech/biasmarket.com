import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { orderRef } from '@biasmarket/utils/order-ref';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AppModule } from './../src/app.module.js';
import {
  deleteOrders,
  mailerDevDir,
  waitForNewMailerFile,
} from './schema-assert.js';

// GET /stores/:storeId/orders/:orderId/related (other orders of the same buyer
// phone in the same store) and the store isolation of customers/lookup.
describe('related orders (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const password = 'correcthorsebatterystaple';
  const userIds: string[] = [];
  const storeIds: string[] = [];
  let aCookie: string;
  let bCookie: string;
  let storeA: string;
  let storeB: string;
  let ipCounter = 0;
  // Unique per run so a reused database never matches old rows.
  const phone = `+5198${String(Date.now()).slice(-7)}`;

  const nextIp = () => `198.51.103.${++ipCounter}`;

  async function signUp(label: string): Promise<string> {
    const email = `related-${label}-${runId}@example.com`;
    const existing = new Set(readdirSync(mailerDevDir));
    const res = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .send({ email, password, name: `Seller ${label}` })
      .expect(200);
    userIds.push(res.body.user.id);
    const html = readFileSync(
      await waitForNewMailerFile(existing, email),
      'utf-8',
    );
    const token = html.match(/verify-email\?token=([^&"]+)/)?.[1];
    if (!token) throw new Error('verification link not found in email');
    await request(app.getHttpServer()).get(
      `/api/auth/verify-email?token=${token}`,
    );
    const signIn = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email, password })
      .expect(200);
    const raw = (signIn.headers['set-cookie'] as unknown as string[]).find(
      (c) => c.includes('session_token'),
    );
    if (!raw) throw new Error('sign-in did not return a session cookie');
    return raw.split(';')[0]!;
  }

  async function seedStore(cookie: string, slug: string) {
    const res = await request(app.getHttpServer())
      .post('/stores')
      .set('Cookie', cookie)
      .send({ name: slug, slug, whatsappNumber: '+51900000000' })
      .expect(201);
    storeIds.push(res.body.id);
    return res.body.id as string;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.getHttpAdapter().getInstance().set('trust proxy', true);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    aCookie = await signUp('a');
    bCookie = await signUp('b');
    storeA = await seedStore(aCookie, `related-a-${runId}`);
    storeB = await seedStore(bCookie, `related-b-${runId}`);
  });

  afterAll(async () => {
    for (const id of storeIds) {
      await deleteOrders(prisma, { storeId: id });
      await prisma.auditLog.deleteMany({ where: { storeId: id } });
      await prisma.customer.deleteMany({ where: { storeId: id } });
      await prisma.paymentMethodConfig.deleteMany({ where: { storeId: id } });
      await prisma.deliveryMethodConfig.deleteMany({ where: { storeId: id } });
      await prisma.store.deleteMany({ where: { id } });
    }
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  async function seedOrder(
    storeId: string,
    overrides: {
      phone?: string;
      normalized?: string | null;
      createdAt?: Date;
      status?: 'ACTIVE' | 'CANCELLED';
      paymentStatus?: 'PENDING_PAYMENT' | 'CANCELLED';
    } = {},
  ) {
    const p = overrides.phone ?? phone;
    return prisma.order.create({
      data: {
        storeId,
        customerPhone: p,
        customerPhoneNormalized:
          overrides.normalized === undefined ? p : overrides.normalized,
        customerName: 'Secret Name',
        source: 'VENDOR_ASSISTED',
        status: overrides.status ?? 'ACTIVE',
        paymentStatus: overrides.paymentStatus ?? 'PENDING_PAYMENT',
        deliveryMethodType: 'PICKUP',
        deliveryDetails: {},
        totalAmount: 50,
        requiredAmount: 50,
        currency: 'PEN',
        expiresAt: new Date(Date.now() + 3_600_000),
        createdAt: overrides.createdAt,
      },
    });
  }

  const related = (storeId: string, orderId: string, cookie = aCookie) =>
    request(app.getHttpServer())
      .get(`/stores/${storeId}/orders/${orderId}/related`)
      .set('Cookie', cookie);

  it('lists the other orders of the same phone, newest first, allow-listed, including cancelled', async () => {
    const oldest = await seedOrder(storeA, {
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    const cancelled = await seedOrder(storeA, {
      createdAt: new Date('2026-02-01T00:00:00Z'),
      status: 'CANCELLED',
      paymentStatus: 'CANCELLED',
    });
    const current = await seedOrder(storeA, {
      createdAt: new Date('2026-03-01T00:00:00Z'),
    });
    await seedOrder(storeA, { phone: '+51911222333' }); // other buyer

    const res = await related(storeA, current.id).expect(200);

    expect(res.body.total).toBe(2);
    expect(res.body.items.map((i: { id: string }) => i.id)).toEqual([
      cancelled.id,
      oldest.id,
    ]);
    expect(res.body.items[0]).toEqual({
      id: cancelled.id,
      orderNumber: orderRef(cancelled.id),
      createdAt: '2026-02-01T00:00:00.000Z',
      status: 'CANCELLED',
      paymentStatus: 'CANCELLED',
      fulfillmentStatus: 'ORDERING',
      totalAmount: '50',
      currency: 'PEN',
      source: 'VENDOR_ASSISTED',
    });
    const text = JSON.stringify(res.body);
    expect(text).not.toContain('Secret Name');
    expect(text).not.toContain(phone);
    expect(text).not.toContain(current.id);
  });

  it('includes legacy rows without a normalised phone, and works when the current order is one', async () => {
    const legacyPhone = `+5197${String(Date.now()).slice(-8)}`;
    const legacy = await seedOrder(storeA, {
      phone: legacyPhone,
      normalized: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    const current = await seedOrder(storeA, {
      phone: legacyPhone,
      normalized: null,
      createdAt: new Date('2026-02-01T00:00:00Z'),
    });
    const modern = await seedOrder(storeA, {
      phone: legacyPhone,
      createdAt: new Date('2026-03-01T00:00:00Z'),
    });

    const res = await related(storeA, current.id).expect(200);
    expect(res.body.items.map((i: { id: string }) => i.id)).toEqual([
      modern.id,
      legacy.id,
    ]);
    expect(res.body.total).toBe(2);
  });

  it("never returns another store's orders of the same phone", async () => {
    const mine = await seedOrder(storeA, { phone: '+51955000777' });
    await seedOrder(storeB, { phone: '+51955000777' });
    const res = await related(storeA, mine.id).expect(200);
    expect(res.body).toEqual({ items: [], total: 0 });
  });

  it("is a 404 for a foreign order via the caller's own store, 403 via the owner's store, 404 for the foreign store with the other order id", async () => {
    const aOrder = await seedOrder(storeA);
    // B asks about A's order through B's own store: the order is not in it.
    await related(storeB, aOrder.id, bCookie).expect(404);
    // B asks through A's store: not the owner.
    await related(storeA, aOrder.id, bCookie).expect(403);
    // Unknown order id in own store.
    await related(storeA, 'does-not-exist').expect(404);
    // Unauthenticated.
    await request(app.getHttpServer())
      .get(`/stores/${storeA}/orders/${aOrder.id}/related`)
      .expect(401);
  });

  it("customers/lookup does not leak another store's history for the same phone (#258)", async () => {
    const onlyInA = '+51955000888';
    await seedOrder(storeA, { phone: onlyInA });
    const lookup = (storeId: string, cookie: string) =>
      request(app.getHttpServer())
        .get(`/stores/${storeId}/customers/lookup`)
        .query({ phone: onlyInA })
        .set('Cookie', cookie);

    const asB = await lookup(storeB, bCookie).expect(200);
    expect(asB.body.previousOrders).toBe(0);
    expect(asB.body.lastAlias).toBeNull();
    await lookup(storeA, bCookie).expect(403);

    const asA = await lookup(storeA, aCookie).expect(200);
    expect(asA.body.previousOrders).toBe(1);
  });
});
