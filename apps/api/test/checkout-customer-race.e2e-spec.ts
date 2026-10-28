import { Test, type TestingModule } from '@nestjs/testing';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomInt, randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AppModule } from './../src/app.module.js';
import {
  deleteOrders,
  mailerDevDir,
  waitForNewMailerFile,
} from './schema-assert.js';

// #333: parallel checkouts for the same brand-new phone used to return 201 +
// 500, failing on BuyerAccount_phone_key and then
// CustomerStoreLink_buyerAccountId_storeId_key (and Customer_storeId_phone_key
// against the assisted flow). A per-phone advisory lock plus ON CONFLICT
// inserts must leave exactly one BuyerAccount, link and Customer.
describe('checkout customer race (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const password = 'correcthorsebatterystaple';
  const userIds: string[] = [];
  let sellerCookie: string;
  let storeId: string;
  let storeSlug: string;
  let productId: string;
  let variantId: string;
  let ipCounter = 0;
  const ROUNDS = 5;
  const newPhone = () => `+519${String(randomInt(1e8)).padStart(8, '0')}`;
  const phones = {
    a: Array.from({ length: ROUNDS }, newPhone),
    b: Array.from({ length: ROUNDS }, newPhone),
    c: Array.from({ length: ROUNDS }, newPhone),
    d: Array.from({ length: ROUNDS }, newPhone),
  };
  const emailFor = (label: string, i: number, who = 'x') =>
    `race-${label}${i}-${who}-${runId}@example.com`;

  const nextIp = () => `198.51.102.${++ipCounter}`;

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
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    sellerCookie = await signUp('race');
    storeSlug = `race-${runId}`;
    ({ storeId, productId, variantId } = await seedStore(
      sellerCookie,
      storeSlug,
    ));
  });

  afterAll(async () => {
    await prisma.orderItem.deleteMany({ where: { storeId } });
    await deleteOrders(prisma, { storeId });
    await prisma.auditLog.deleteMany({ where: { storeId } });
    await prisma.customerStoreLink.deleteMany({ where: { storeId } });
    await prisma.customer.deleteMany({ where: { storeId } });
    await prisma.productVariant.deleteMany({ where: { storeId } });
    await prisma.product.deleteMany({ where: { storeId } });
    await prisma.notification.deleteMany({ where: { storeId } });
    await prisma.paymentMethodConfig.deleteMany({ where: { storeId } });
    await prisma.deliveryMethodConfig.deleteMany({ where: { storeId } });
    await prisma.store.deleteMany({ where: { id: storeId } });
    await prisma.buyerAccount.deleteMany({
      where: {
        OR: [
          { phone: { in: Object.values(phones).flat() } },
          { email: { startsWith: 'race-', endsWith: `-${runId}@example.com` } },
        ],
      },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  const checkout = (phone: string, email: string) =>
    request(app.getHttpServer())
      .post(`/stores/${storeSlug}/checkout`)
      .set('X-Forwarded-For', nextIp())
      .field('deliveryMethodType', 'PICKUP')
      .field('customerPhone', phone)
      .field('customerEmail', email)
      .field('customerName', 'Race')
      .field('items', JSON.stringify([{ productId, variantId, quantity: 1 }]));

  const assisted = (phone: string) =>
    request(app.getHttpServer())
      .post(`/stores/${storeId}/orders/assisted`)
      .set('Cookie', sellerCookie)
      .send({
        deliveryMethodType: 'PICKUP',
        customerPhone: phone,
        customerName: 'Race',
        items: [{ productId, variantId, quantity: 1 }],
      });

  const counts = async (phone: string) => ({
    accounts: await prisma.buyerAccount.count({ where: { phone } }),
    links: await prisma.customerStoreLink.count({
      where: { storeId, buyerAccount: { phone } },
    }),
    customers: await prisma.customer.count({ where: { storeId, phone } }),
  });

  it('(a) two checkouts for a brand-new phone and email: 201/201, one account, link and Customer', async () => {
    for (let i = 0; i < ROUNDS; i++) {
      const phone = phones.a[i]!;
      const email = emailFor('a', i);
      const results = await Promise.all([
        checkout(phone, email),
        checkout(phone, email),
      ]);
      expect(results.map((r) => r.status)).toEqual([201, 201]);
      expect(await counts(phone)).toEqual({
        accounts: 1,
        links: 1,
        customers: 1,
      });
    }
  }, 60_000);

  it('(b) an existing BuyerAccount without link or Customer: 201/201, one link and Customer', async () => {
    for (let i = 0; i < ROUNDS; i++) {
      const phone = phones.b[i]!;
      const email = emailFor('b', i);
      await prisma.buyerAccount.create({
        data: { phone, email, emailVerified: true },
      });
      const results = await Promise.all([
        checkout(phone, email),
        checkout(phone, email),
      ]);
      expect(results.map((r) => r.status)).toEqual([201, 201]);
      expect(await counts(phone)).toEqual({
        accounts: 1,
        links: 1,
        customers: 1,
      });
    }
  }, 60_000);

  it("(c) different emails for a new phone: the loser gets a guest order and the winner's account is untouched", async () => {
    for (let i = 0; i < ROUNDS; i++) {
      const phone = phones.c[i]!;
      const emails = [emailFor('c', i, 'one'), emailFor('c', i, 'two')];
      const results = await Promise.all(
        emails.map((email) => checkout(phone, email)),
      );
      expect(results.map((r) => r.status)).toEqual([201, 201]);

      const account = await prisma.buyerAccount.findUniqueOrThrow({
        where: { phone },
      });
      expect(emails).toContain(account.email);
      expect(account.emailVerified).toBe(false);
      const loserEmail = emails.find((e) => e !== account.email)!;

      const orders = await prisma.order.findMany({
        where: { storeId, customerPhoneNormalized: phone },
      });
      expect(orders).toHaveLength(2);
      expect(
        orders.filter((o) => o.buyerAccountId === account.id),
      ).toHaveLength(1);
      expect(orders.filter((o) => o.buyerAccountId === null)).toHaveLength(1);
      expect(await counts(phone)).toEqual({
        accounts: 1,
        links: 1,
        customers: 1,
      });
      // The loser's response carries nothing about the winner's account.
      const loserRes = results[emails.indexOf(loserEmail)]!;
      expect(JSON.stringify(loserRes.body)).not.toContain(account.id);
      expect(JSON.stringify(loserRes.body)).not.toContain(account.email!);
    }
  }, 60_000);

  it('(d) a checkout racing an assisted order for a brand-new phone (no pre-seeded Customer): 201/201, one Customer', async () => {
    for (let i = 0; i < ROUNDS; i++) {
      const phone = phones.d[i]!;
      const [assistedRes, checkoutRes] = await Promise.all([
        assisted(phone),
        checkout(phone, emailFor('d', i)),
      ]);
      expect(assistedRes.status).toBe(201);
      expect(checkoutRes.status).toBe(201);
      expect(await counts(phone)).toEqual({
        accounts: 1,
        links: 1,
        customers: 1,
      });
    }
  }, 60_000);
});
