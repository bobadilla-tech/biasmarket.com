import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service.js';
import request from 'supertest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './../src/app.module.js';
import {
  cleanupBuyerTestData,
  mailerDevDir,
  waitForNewMailerFile,
} from './schema-assert.js';

// Validates that better-auth's Bearer plugin (auth.config.ts) exposes the
// session token via set-auth-token on sign-in, and that the token can be used
// on the Authorization header to access seller-protected endpoints — no
// cookie, no Origin header — proving the mobile seller path works end-to-end.
const openapiPath = join(__dirname, '..', 'openapi.json');
let openapiRaw: string;
try {
  openapiRaw = readFileSync(openapiPath, 'utf-8');
} catch {
  throw new Error(
    `${openapiPath} not found — run "pnpm --filter api generate:openapi" first.`,
  );
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const openapi = JSON.parse(openapiRaw);

describe('seller bearer auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sellerUserId: string | undefined;
  let storeId: string | undefined;
  let productId: string | undefined;

  const runId = `sba-e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const sellerEmail = `sba-e2e-${runId}@example.com`;
  const password = 'correcthorsebatterystaple';
  const storeSlug = `sba-store-${runId}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    await cleanupBuyerTestData(prisma, []);

    const existingMailerFiles = new Set(readdirSync(mailerDevDir));

    const signUpRes = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .send({ email: sellerEmail, password, name: 'Bearer E2E Seller' })
      .expect(200);
    sellerUserId = signUpRes.body.user.id;

    const mailerFile = await waitForNewMailerFile(
      existingMailerFiles,
      sellerEmail,
    );
    const html = readFileSync(mailerFile, 'utf-8');
    const tokenMatch = html.match(/verify-email\?token=([^&"]+)/);
    if (!tokenMatch) throw new Error('verification link not found in email');
    await request(app.getHttpServer())
      .get(`/api/auth/verify-email?token=${tokenMatch[1]}`)
      .expect((res) => {
        if (res.status >= 400) {
          throw new Error(`verify-email failed with status ${res.status}`);
        }
      });
  });

  afterAll(async () => {
    if (productId) {
      await prisma.orderPayment.deleteMany({ where: { storeId: storeId! } });
      await prisma.orderItem.deleteMany({ where: { storeId: storeId! } });
      await prisma.order.deleteMany({ where: { storeId: storeId! } });
      await prisma.productVariant.deleteMany({ where: { productId } });
      await prisma.product.deleteMany({ where: { id: productId } });
    }
    if (storeId) {
      await prisma.customerStoreLink.deleteMany({ where: { storeId } });
      await prisma.notification.deleteMany({ where: { storeId } });
      await prisma.paymentMethodConfig.deleteMany({ where: { storeId } });
      await prisma.deliveryMethodConfig.deleteMany({ where: { storeId } });
      await prisma.store.deleteMany({ where: { id: storeId } });
    }
    if (sellerUserId) {
      await prisma.user.deleteMany({ where: { id: sellerUserId } });
    }
    await app.close();
  });

  it(
    'sign-in returns set-auth-token; bearer token grants access to seller ' +
      'endpoint with no cookie and no Origin',
    async () => {
      // Sign in — Bearer plugin AFTER hook exposes raw token via
      // set-auth-token response header.
      const signInRes = await request(app.getHttpServer())
        .post('/api/auth/sign-in/email')
        .send({ email: sellerEmail, password })
        .expect(200);

      const bearerToken = signInRes.headers['set-auth-token'] as
        string | undefined;
      expect(bearerToken).toBeDefined();
      expect(typeof bearerToken).toBe('string');
      expect(bearerToken!.length).toBeGreaterThan(10);

      // Cookie must also be set (cookie-mode is still the default).
      const setCookie = signInRes.headers['set-cookie'] as unknown as string[];
      const rawCookie = setCookie?.find((c) => c.includes('session_token'));
      expect(rawCookie).toBeDefined();

      // Create a store using the cookie (proving cookie-mode still works).
      storeId = (
        await request(app.getHttpServer())
          .post('/stores')
          .set('Cookie', rawCookie!.split(';')[0]!)
          .send({
            name: 'Bearer E2E Store',
            slug: storeSlug,
            whatsappNumber: '+51900000003',
          })
          .expect(201)
      ).body.id;

      // Create a product using the bearer token ONLY — no cookie, no Origin
      // header.  Bearer plugin converts the token → cookie → AuthGuard passes.
      const productRes = await request(app.getHttpServer())
        .post(`/stores/${storeId}/products`)
        .set('Authorization', `Bearer ${bearerToken}`)
        .send({
          name: 'Bearer E2E Product',
          price: 20,
          currency: 'PEN',
          stock: 50,
        })
        .expect(201);
      productId = productRes.body.id;
      expect(productRes.body.name).toBe('Bearer E2E Product');

      // Forged bearer token → 401.
      await request(app.getHttpServer())
        .post(`/stores/${storeId}/products`)
        .set('Authorization', 'Bearer absolutely-not-a-real-token')
        .send({ name: 'Should Fail', price: 1, currency: 'PEN', stock: 1 })
        .expect(401);

      // Cookie path still works (regression guard).
      const listRes = await request(app.getHttpServer())
        .get(`/stores/${storeId}/products`)
        .set('Cookie', rawCookie!.split(';')[0]!)
        .expect(200);
      expect(
        listRes.body.data.some((p: { id: string }) => p.id === productId),
      ).toBe(true);
    },
  );

  it('bearer token is rejected when the session has been revoked (sign-out)', async () => {
    // Sign in fresh to get a valid token.
    const signInRes = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email: sellerEmail, password })
      .expect(200);
    const token = signInRes.headers['set-auth-token'] as string;
    const rawCookie = (
      signInRes.headers['set-cookie'] as unknown as string[]
    )?.find((c) => c.includes('session_token'));
    expect(token).toBeDefined();

    // Sign out (revokes session in DB).
    await request(app.getHttpServer())
      .post('/api/auth/sign-out')
      .set('Cookie', rawCookie!.split(';')[0]!)
      .expect(200);

    // The bearer token must now be rejected (session revoked in DB).
    // `get-session` is not the right probe: better-auth returns HTTP 200
    // with a null body when no session is found, so it can't assert 401.
    // Hit a bearer-protected seller route instead (ProductsController applies
    // AuthGuard), which must 401 once the session row is gone.
    await request(app.getHttpServer())
      .post(`/stores/${storeId}/products`)
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Should Fail', price: 1, currency: 'PEN', stock: 1 })
      .expect(401);
  });
});
