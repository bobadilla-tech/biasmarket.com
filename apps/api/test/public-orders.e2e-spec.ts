import { Test, type TestingModule } from '@nestjs/testing';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service.js';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { AppModule } from './../src/app.module.js';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter.js';
import { createOrderAccessToken } from '@biasmarket/utils/assisted-order';
import {
  deleteOrders,
  mailerDevDir,
  waitForNewMailerFile,
} from './schema-assert.js';

// The public link is token-only. These hit the real AppModule (the controller
// spec mocks the service) with the same prefix and exception filter as
// main.ts, so a 404 path is the production shape.
describe('public orders (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sessionCookie: string;
  let userId: string;
  let storeId: string;
  let storeSlug: string;
  let productId: string;
  let productVariantId: string;
  const orderIds: string[] = [];

  const runId = randomUUID();
  const email = `public-orders-e2e-${runId}@example.com`;
  const customerPhone = '+51987654321';
  const recipientPhone = '+51933333333';
  const documentNumber = '44556677';

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
    await app.init();
    prisma = moduleFixture.get(PrismaService);

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
        if (res.status >= 400) {
          throw new Error(`verify-email failed with status ${res.status}`);
        }
      });

    const signInRes = await request(app.getHttpServer())
      .post('/api/auth/sign-in/email')
      .send({ email, password })
      .expect(200);
    const setCookie = signInRes.headers['set-cookie'] as unknown as string[];
    const raw = setCookie?.find((c) => c.includes('session_token'));
    if (!raw) throw new Error('sign-in did not return a session cookie');
    sessionCookie = raw.split(';')[0]!;

    storeSlug = `public-orders-e2e-${runId}`;
    const storeRes = await request(app.getHttpServer())
      .post('/api/stores')
      .set('Cookie', sessionCookie)
      .send({
        name: 'E2E Store',
        slug: storeSlug,
        whatsappNumber: '+51900000000',
      })
      .expect(201);
    storeId = storeRes.body.id;

    const productRes = await request(app.getHttpServer())
      .post(`/api/stores/${storeId}/products`)
      .set('Cookie', sessionCookie)
      .send({ name: 'E2E Product', price: 25, currency: 'PEN', stock: 100 })
      .expect(201);
    productId = productRes.body.id;
    productVariantId = productRes.body.variants[0].id;
    await request(app.getHttpServer())
      .patch(`/api/stores/${storeId}/products/${productId}/publish`)
      .set('Cookie', sessionCookie)
      .expect(200);
  });

  afterAll(async () => {
    if (orderIds.length > 0) {
      await prisma.orderPayment.deleteMany({
        where: { orderId: { in: orderIds } },
      });
      await prisma.orderItem.deleteMany({
        where: { orderId: { in: orderIds } },
      });
      await deleteOrders(prisma, { id: { in: orderIds } });
    }
    if (storeId) {
      await prisma.orderPayment.deleteMany({ where: { storeId } });
      await prisma.orderItem.deleteMany({ where: { storeId } });
      await deleteOrders(prisma, { storeId });
      await prisma.notification.deleteMany({ where: { storeId } });
      await prisma.auditLog.deleteMany({ where: { storeId } });
      await prisma.customer.deleteMany({ where: { storeId } });
      await prisma.paymentMethodConfig.deleteMany({ where: { storeId } });
      await prisma.deliveryMethodConfig.deleteMany({ where: { storeId } });
      await prisma.productVariant.deleteMany({ where: { storeId } });
      await prisma.product.deleteMany({ where: { storeId } });
      await prisma.store.deleteMany({ where: { id: storeId } });
    }
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  async function checkout(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post(`/api/stores/${storeSlug}/checkout`)
      .field('deliveryMethodType', 'PICKUP')
      .field('customerPhone', customerPhone)
      .field(
        'items',
        JSON.stringify([
          { productId, variantId: productVariantId, quantity: 1 },
        ]),
      )
      .expect(201);
    const orderId = res.body.order.id as string;
    orderIds.push(orderId);
    return orderId;
  }

  async function attachToken(orderId: string, tokenHash: string) {
    await prisma.order.update({
      where: { id: orderId },
      data: {
        accessTokenHash: tokenHash,
        customerPhone,
        deliveryMethodType: 'COURIER',
        deliveryDetails: {
          shippingAddress: {
            line1: 'Av. Ejemplo 123',
            district: 'Miraflores',
            city: 'Lima',
            reference: 'frente al parque',
            recipientName: 'Ana Recipient',
            phone: recipientPhone,
            documentNumber,
          },
        },
      },
    });
  }

  function privateLinkHeaders(res: { headers: Record<string, string> }) {
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
  }

  it('answers unknown and revoked tokens with the same 404 and a scrubbed path', async () => {
    const unknown = createOrderAccessToken();
    const revoked = createOrderAccessToken();
    const orderId = await checkout();
    await attachToken(orderId, revoked.tokenHash);
    await prisma.order.update({
      where: { id: orderId },
      data: { accessTokenRevokedAt: new Date() },
    });

    const unknownRes = await request(app.getHttpServer())
      .get(`/api/public/orders/${unknown.token}`)
      .expect(404);
    const revokedRes = await request(app.getHttpServer())
      .get(`/api/public/orders/${revoked.token}`)
      .expect(404);

    for (const res of [unknownRes, revokedRes]) {
      privateLinkHeaders(res);
      expect(res.body.statusCode).toBe(404);
      expect(res.body.message).toBe('Pedido no encontrado');
      expect(res.body.path).toBe('/api/public/orders/:token');
      expect(JSON.stringify(res.body)).not.toContain(unknown.token);
      expect(JSON.stringify(res.body)).not.toContain(revoked.token);
    }
  });

  it('returns the allow-listed courier address and a masked phone', async () => {
    const { token, tokenHash } = createOrderAccessToken();
    const orderId = await checkout();
    await attachToken(orderId, tokenHash);

    const res = await request(app.getHttpServer())
      .get(`/api/public/orders/${token}`)
      .expect(200);

    privateLinkHeaders(res);
    expect(res.body.customerPhone).toBe('+51 9** *** 321');
    expect(res.body.deliveryDetails).toEqual({
      line1: 'Av. Ejemplo 123',
      district: 'Miraflores',
      city: 'Lima',
      reference: 'frente al parque',
      pickupPointLabel: null,
    });
    expect(res.body.items).toEqual([
      expect.objectContaining({ name: 'E2E Product', quantity: 1 }),
    ]);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain(recipientPhone);
    expect(body).not.toContain(documentNumber);
    expect(body).not.toContain('Ana Recipient');
    expect(body).not.toContain(customerPhone);
    expect(body).not.toContain(token);
  });

  it('records INVITE_SHOWN once, and records nothing for a cancelled order', async () => {
    const shown = createOrderAccessToken();
    const shownOrderId = await checkout();
    await attachToken(shownOrderId, shown.tokenHash);

    await request(app.getHttpServer())
      .post(`/api/public/orders/${shown.token}/events`)
      .send({ type: 'INVITE_SHOWN' })
      .expect(204);
    await request(app.getHttpServer())
      .post(`/api/public/orders/${shown.token}/events`)
      .send({ type: 'INVITE_SHOWN' })
      .expect(204);

    expect(
      await prisma.orderEvent.count({
        where: { orderId: shownOrderId, type: 'INVITE_SHOWN' },
      }),
    ).toBe(1);

    const cancelled = createOrderAccessToken();
    const cancelledOrderId = await checkout();
    await attachToken(cancelledOrderId, cancelled.tokenHash);
    await prisma.order.update({
      where: { id: cancelledOrderId },
      data: { status: 'CANCELLED', paymentStatus: 'CANCELLED' },
    });

    await request(app.getHttpServer())
      .post(`/api/public/orders/${cancelled.token}/events`)
      .send({ type: 'INVITE_SHOWN' })
      .expect(204);
    expect(
      await prisma.orderEvent.count({
        where: { orderId: cancelledOrderId, type: 'INVITE_SHOWN' },
      }),
    ).toBe(0);
  });
});
