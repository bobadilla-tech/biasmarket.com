import { Test, type TestingModule } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AppModule } from './../src/app.module.js';
import { mailerDevDir, waitForNewMailerFile } from './schema-assert.js';

// The seller's assisted-order form loads delivery, pickup, payment and courier
// options from the PUBLIC endpoints (the same ones the storefront checkout
// uses). A seller must be able to create orders before publishing, so those
// endpoints must keep answering for a store that is not public.
describe('public store options for an unpublished store (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let userId: string;
  let storeId: string;
  const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const slug = `unpublished-${runId}`;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    const email = `unpublished-${runId}@example.com`;
    const password = 'correcthorsebatterystaple';
    const existing = new Set(readdirSync(mailerDevDir));
    const signUp = await request(app.getHttpServer())
      .post('/api/auth/sign-up/email')
      .send({ email, password, name: 'Seller' })
      .expect(200);
    userId = signUp.body.user.id;
    const html = readFileSync(
      await waitForNewMailerFile(existing, email),
      'utf-8',
    );
    const token = html.match(/verify-email\?token=([^&"]+)/)?.[1];
    await request(app.getHttpServer()).get(
      `/api/auth/verify-email?token=${token}`,
    );
    const signIn = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email, password })
      .expect(200);
    const cookie = (signIn.headers['set-cookie'] as unknown as string[])
      .find((c) => c.includes('session_token'))!
      .split(';')[0]!;
    const store = await request(app.getHttpServer())
      .post('/stores')
      .set('Cookie', cookie)
      .send({ name: slug, slug, whatsappNumber: '+51900000000' })
      .expect(201);
    storeId = store.body.id;
    await prisma.store.update({
      where: { id: storeId },
      data: { isPublic: false },
    });
  });

  afterAll(async () => {
    if (storeId) {
      await prisma.paymentMethodConfig.deleteMany({ where: { storeId } });
      await prisma.deliveryMethodConfig.deleteMany({ where: { storeId } });
      await prisma.store.deleteMany({ where: { id: storeId } });
    }
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  it.each([
    ['delivery methods', 'public/delivery-methods'],
    ['pickup points', 'public/pickup-points'],
    ['payment methods', 'public/payment-methods'],
    ['couriers', 'public/couriers'],
  ])('serves %s', async (_label, path) => {
    const store = await prisma.store.findUniqueOrThrow({
      where: { id: storeId },
    });
    expect(store.isPublic).toBe(false);
    await request(app.getHttpServer())
      .get(`/stores/${slug}/${path}`)
      .expect(200);
  });

  it('serves the public store detail the checkout options also read', async () => {
    await request(app.getHttpServer())
      .get(`/stores/${slug}/public`)
      .expect(200);
  });
});
