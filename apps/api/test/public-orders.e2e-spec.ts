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

  // A seller-recorded payment counts as paid (`countsTowardPaid`), which is
  // what makes an order eligible for the save-with-Google invite.
  async function addCountingPayment(orderId: string) {
    await prisma.orderPayment.create({
      data: {
        orderId,
        storeId,
        amount: 10,
        currency: 'PEN',
        source: 'SELLER_RECORDED',
      },
    });
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
    await addCountingPayment(shownOrderId);

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
    await addCountingPayment(cancelledOrderId);
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

  it('records no invite rows for an order without a counting payment or a rejected one', async () => {
    const unpaid = createOrderAccessToken();
    const unpaidOrderId = await checkout();
    await attachToken(unpaidOrderId, unpaid.tokenHash);

    const rejected = createOrderAccessToken();
    const rejectedOrderId = await checkout();
    await attachToken(rejectedOrderId, rejected.tokenHash);
    await addCountingPayment(rejectedOrderId);
    await prisma.order.update({
      where: { id: rejectedOrderId },
      data: { paymentStatus: 'REJECTED' },
    });

    for (const { token } of [unpaid, rejected]) {
      for (const type of ['INVITE_SHOWN', 'INVITE_CLICKED']) {
        await request(app.getHttpServer())
          .post(`/api/public/orders/${token}/events`)
          .send({ type, moment: 'banner' })
          .expect(204);
      }
    }

    expect(
      await prisma.orderEvent.count({
        where: {
          orderId: { in: [unpaidOrderId, rejectedOrderId] },
          type: { in: ['INVITE_SHOWN', 'INVITE_CLICKED'] },
        },
      }),
    ).toBe(0);
  });

  describe('receipt confirmation', () => {
    // Checkout is throttled, so one order is created for the whole block and
    // reset to a delivered, unconfirmed state before every case.
    let shared: { token: string; tokenHash: string; id: string };

    beforeAll(async () => {
      const link = createOrderAccessToken();
      const id = await checkout();
      await attachToken(id, link.tokenHash);
      shared = { ...link, id };
    });

    async function deliverable(patch: Record<string, unknown> = {}) {
      // One counting payment for the shared order, so invite events apply.
      if (
        (await prisma.orderPayment.count({ where: { orderId: shared.id } })) ===
        0
      ) {
        await addCountingPayment(shared.id);
      }
      await prisma.orderEvent.deleteMany({
        where: { orderId: shared.id, type: 'RECEIPT_CONFIRMED' },
      });
      await prisma.notification.deleteMany({
        where: { entityId: shared.id, type: 'RECEIPT_CONFIRMED' },
      });
      await prisma.order.update({
        where: { id: shared.id },
        data: {
          status: 'ACTIVE',
          paymentStatus: 'VERIFIED',
          fulfillmentStatus: 'IN_TRANSIT',
          buyerConfirmedReceivedAt: null,
          accessTokenRevokedAt: null,
          ...patch,
        },
      });
      return shared;
    }

    const confirm = (token: string) =>
      request(app.getHttpServer())
        .post(`/api/public/orders/${token}/receipt`)
        .send({});

    it('is idempotent and exposes the date on the public order and the seller detail', async () => {
      const { token, id } = await deliverable();

      const first = await confirm(token).expect(200);
      privateLinkHeaders(first);
      const second = await confirm(token).expect(200);
      expect(second.body.receiptConfirmedAt).toBe(
        first.body.receiptConfirmedAt,
      );

      expect(
        await prisma.orderEvent.count({
          where: { orderId: id, type: 'RECEIPT_CONFIRMED' },
        }),
      ).toBe(1);
      expect(
        await prisma.notification.count({
          where: { entityId: id, type: 'RECEIPT_CONFIRMED' },
        }),
      ).toBe(1);
      const stored = await prisma.order.findUniqueOrThrow({
        where: { id },
        select: { fulfillmentStatus: true },
      });
      expect(stored.fulfillmentStatus).toBe('IN_TRANSIT');

      const pub = await request(app.getHttpServer())
        .get(`/api/public/orders/${token}`)
        .expect(200);
      expect(pub.body.receiptConfirmedAt).toBe(first.body.receiptConfirmedAt);

      const seller = await request(app.getHttpServer())
        .get(`/api/stores/${storeId}/orders/${id}`)
        .set('Cookie', sessionCookie)
        .expect(200);
      expect(seller.body.buyerConfirmedReceivedAt).toBe(
        first.body.receiptConfirmedAt,
      );
    });

    it('lets exactly one of many concurrent confirmations win', async () => {
      const { token, id } = await deliverable();

      const results = await Promise.all(
        Array.from({ length: 8 }, () => confirm(token)),
      );

      expect(results.map((r) => r.status)).toEqual(Array(8).fill(200));
      expect(new Set(results.map((r) => r.body.receiptConfirmedAt)).size).toBe(
        1,
      );
      expect(
        await prisma.orderEvent.count({
          where: { orderId: id, type: 'RECEIPT_CONFIRMED' },
        }),
      ).toBe(1);
      expect(
        await prisma.notification.count({
          where: { entityId: id, type: 'RECEIPT_CONFIRMED' },
        }),
      ).toBe(1);
    });

    it('rejects an order that is not delivered yet, unpaid or cancelled, writing nothing', async () => {
      for (const patch of [
        { fulfillmentStatus: 'ORDERING' },
        { paymentStatus: 'PAYMENT_SUBMITTED' },
        { status: 'CANCELLED' },
      ]) {
        const { token, id } = await deliverable(patch);
        await confirm(token).expect(409);
        const row = await prisma.order.findUniqueOrThrow({
          where: { id },
          select: { buyerConfirmedReceivedAt: true },
        });
        expect(row.buyerConfirmedReceivedAt).toBeNull();
        expect(
          await prisma.orderEvent.count({
            where: { orderId: id, type: 'RECEIPT_CONFIRMED' },
          }),
        ).toBe(0);
      }
    });

    it('serves the timeline only for a claimed order, picked fields only, still no-store', async () => {
      const { token, id } = await deliverable();
      await prisma.orderEvent.deleteMany({ where: { orderId: id } });
      await prisma.orderEvent.createMany({
        data: [
          {
            orderId: id,
            storeId,
            type: 'PAYMENT_VOIDED',
            actor: 'SELLER',
            visibleToBuyer: true,
            payload: { amount: 20, currency: 'PEN', paymentId: 'pay-secret' },
          },
          {
            orderId: id,
            storeId,
            type: 'BUYER_NOTIFIED',
            actor: 'SELLER',
            visibleToBuyer: true,
            payload: { notice: 'ASSISTED_READY' },
          },
        ],
      });

      const unclaimed = await request(app.getHttpServer())
        .get(`/api/public/orders/${token}`)
        .expect(200);
      privateLinkHeaders(unclaimed);
      expect(unclaimed.body.claimed).toBe(false);
      expect(unclaimed.body.timeline).toEqual([]);

      await prisma.order.update({
        where: { id },
        data: { claimedAt: new Date() },
      });
      const claimed = await request(app.getHttpServer())
        .get(`/api/public/orders/${token}`)
        .expect(200);
      privateLinkHeaders(claimed);
      expect(claimed.body.claimed).toBe(true);
      expect(claimed.body.timeline).toHaveLength(1);
      expect(Object.keys(claimed.body.timeline[0]).sort()).toEqual(
        ['amount', 'at', 'resolution', 'toStatus', 'type'].sort(),
      );
      expect(claimed.body.timeline[0].type).toBe('PAYMENT_VOIDED');
      expect(claimed.body.timeline[0].amount).toBe('20');
      expect(JSON.stringify(claimed.body)).not.toMatch(/pay-secret|ASSISTED/);

      // The token link still works, with the same essentials, after a claim.
      expect(claimed.body.orderNumber).toBe(unclaimed.body.orderNumber);
      await prisma.order.update({ where: { id }, data: { claimedAt: null } });
    });

    it('stores only the moment on invite events, dedupes SHOWN per moment, and ignores a claimed order', async () => {
      const { token, id } = await deliverable();
      await prisma.orderEvent.deleteMany({
        where: {
          orderId: id,
          type: { in: ['INVITE_SHOWN', 'INVITE_CLICKED'] },
        },
      });
      const post = (body: Record<string, unknown>) =>
        request(app.getHttpServer())
          .post(`/api/public/orders/${token}/events`)
          .send(body);

      await post({ type: 'INVITE_SHOWN', moment: 'pago_validado' }).expect(204);
      await post({ type: 'INVITE_SHOWN', moment: 'pago_validado' }).expect(204);
      await post({ type: 'INVITE_SHOWN', moment: 'banner' }).expect(204);
      await post({ type: 'INVITE_CLICKED', moment: 'banner' }).expect(204);
      // A retried press of the same moment is not a second row.
      await post({ type: 'INVITE_CLICKED', moment: 'banner' }).expect(204);
      // An older moment-less client also dedupes against the specific event.
      await post({ type: 'INVITE_CLICKED' }).expect(204);

      const rows = await prisma.orderEvent.findMany({
        where: {
          orderId: id,
          type: { in: ['INVITE_SHOWN', 'INVITE_CLICKED'] },
        },
        orderBy: { createdAt: 'asc' },
      });
      expect(rows.map((r) => [r.type, r.payload])).toEqual([
        ['INVITE_SHOWN', { moment: 'pago_validado' }],
        ['INVITE_SHOWN', { moment: 'banner' }],
        ['INVITE_CLICKED', { moment: 'banner' }],
      ]);
      expect(rows.every((r) => r.visibleToBuyer === false)).toBe(true);

      await prisma.orderEvent.deleteMany({
        where: { orderId: id, type: 'INVITE_CLICKED' },
      });
      await Promise.all([
        post({ type: 'INVITE_CLICKED' }).expect(204),
        post({ type: 'INVITE_CLICKED', moment: 'banner' }).expect(204),
      ]);
      expect(
        await prisma.orderEvent.count({
          where: { orderId: id, type: 'INVITE_CLICKED' },
        }),
      ).toBe(1);

      // If an older client records the event first, a later specific moment
      // must still dedupe against that legacy row.
      await prisma.orderEvent.deleteMany({
        where: { orderId: id, type: 'INVITE_SHOWN' },
      });
      await post({ type: 'INVITE_SHOWN' }).expect(204);
      await post({ type: 'INVITE_SHOWN', moment: 'banner' }).expect(204);
      const legacyFirstRows = await prisma.orderEvent.findMany({
        where: { orderId: id, type: 'INVITE_SHOWN' },
      });
      expect(legacyFirstRows.map((row) => row.payload)).toEqual([{}]);

      // Closed set: nothing free-form reaches the stored payload.
      await post({ type: 'INVITE_SHOWN', moment: 'a@b.com' }).expect(400);
      await post({
        type: 'INVITE_SHOWN',
        moment: 'banner',
        phone: '+519',
      }).expect(400);

      // A claimed order is not an invite funnel any more.
      await prisma.order.update({
        where: { id },
        data: { claimedAt: new Date() },
      });
      await post({ type: 'INVITE_SHOWN', moment: 'entrega' }).expect(204);
      expect(
        await prisma.orderEvent.count({
          where: { orderId: id, type: 'INVITE_SHOWN' },
        }),
      ).toBe(1);
      await prisma.order.update({ where: { id }, data: { claimedAt: null } });
    });

    it('answers unknown and revoked tokens with the same 404, and rejects a form body', async () => {
      const unknown = await confirm(createOrderAccessToken().token).expect(404);
      const revoked = await deliverable({ accessTokenRevokedAt: new Date() });
      const revokedRes = await confirm(revoked.token).expect(404);
      expect({ ...revokedRes.body, timestamp: undefined }).toEqual({
        ...unknown.body,
        timestamp: undefined,
      });

      const live = await deliverable();
      await request(app.getHttpServer())
        .post(`/api/public/orders/${live.token}/receipt`)
        .type('form')
        .send({ a: 'b' })
        .expect(415);
    });
  });
});
