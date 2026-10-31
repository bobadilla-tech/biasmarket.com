import { Test, type TestingModule } from "@nestjs/testing";
import { type INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { AppModule } from "./../src/app.module.js";
import { AllExceptionsFilter } from "../src/common/filters/all-exceptions.filter.js";
import { buildCorsOptions } from "../src/common/cors-options.js";
import { isIdempotencyKeyConflict } from "../src/modules/orders/application/idempotency-key.js";
import {
  deleteOrders,
  mailerDevDir,
  waitForNewMailerFile,
} from "./schema-assert.js";

// #336: POST /stores/:storeId/orders/assisted with an `Idempotency-Key`. A
// retried request must never create a second order or reserve stock twice,
// even when two identical requests race. Needs a real database: the guarantee
// is the unique index on (storeId, createdByUserId, idempotencyKey), which the
// unit specs' fake Prisma cannot exercise.
describe("assisted order idempotency (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const password = "correcthorsebatterystaple";
  const userIds: string[] = [];
  const storeIds: string[] = [];
  let sellerCookie: string;
  let otherCookie: string;
  let storeId: string;
  let otherStoreId: string;
  let otherProductId: string;
  let otherVariantId: string;
  // Seller routes are throttled to 20/min per user per endpoint, and the race
  // test alone sends 10, so it gets its own seller.
  let raceCookie: string;
  let raceStoreId: string;
  let raceProductId: string;
  let raceVariantId: string;
  let sellerSecondStoreId: string;
  let secondProductId: string;
  let secondVariantId: string;
  let productId: string;
  let variantId: string;
  let scarceProductId: string;
  let scarceVariantId: string;
  let ipCounter = 0;
  const ROUNDS = 5;

  const nextIp = () => `198.51.103.${++ipCounter}`;

  async function signUp(label: string): Promise<string> {
    const email = `assisted-${label}-${runId}@example.com`;
    const existing = new Set(readdirSync(mailerDevDir));
    const res = await request(app.getHttpServer())
      .post("/api/auth/sign-up/email")
      .set("X-Forwarded-For", nextIp())
      .send({ email, password, name: `Seller ${label}` })
      .expect(200);
    userIds.push(res.body.user.id);
    const html = readFileSync(
      await waitForNewMailerFile(existing, email, 20_000),
      "utf-8",
    );
    const token = html.match(/verify-email\?token=([^&"]+)/)?.[1];
    if (!token) throw new Error("verification link not found in email");
    await request(app.getHttpServer()).get(
      `/api/auth/verify-email?token=${token}`,
    );
    const signIn = await request(app.getHttpServer())
      .post("/api/auth/sign-in/email")
      .set("X-Forwarded-For", nextIp())
      .send({ email, password })
      .expect(200);
    const raw = (signIn.headers["set-cookie"] as unknown as string[]).find(
      (c) => c.includes("session_token"),
    );
    if (!raw) throw new Error("sign-in did not return a session cookie");
    return raw.split(";")[0]!;
  }

  async function seedStore(cookie: string, slug: string, price = 25) {
    const store = await request(app.getHttpServer())
      .post("/stores")
      .set("Cookie", cookie)
      .send({ name: slug, slug, whatsappNumber: "+51900000000" })
      .expect(201);
    const product = await request(app.getHttpServer())
      .post(`/stores/${store.body.id}/products`)
      .set("Cookie", cookie)
      .send({ name: "Album", price, currency: "PEN", stock: 50 })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/stores/${store.body.id}/products/${product.body.id}/publish`)
      .set("Cookie", cookie)
      .expect(200);
    return {
      storeId: store.body.id as string,
      productId: product.body.id as string,
      variantId: product.body.variants[0].id as string,
    };
  }

  // One unit of stock: the order that takes it leaves nothing for a retry.
  async function seedScarceProduct(cookie: string, id: string) {
    const product = await request(app.getHttpServer())
      .post(`/stores/${id}/products`)
      .set("Cookie", cookie)
      .send({ name: "Last one", price: 10, currency: "PEN", stock: 1 })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/stores/${id}/products/${product.body.id}/publish`)
      .set("Cookie", cookie)
      .expect(200);
    return {
      productId: product.body.id as string,
      variantId: product.body.variants[0].id as string,
    };
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.getHttpAdapter().getInstance().set("trust proxy", true);
    app.enableCors(buildCorsOptions());
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    sellerCookie = await signUp("idem-a");
    otherCookie = await signUp("idem-b");
    raceCookie = await signUp("idem-c");
    ({ storeId, productId, variantId } = await seedStore(
      sellerCookie,
      `idem-a-${runId}`,
      25,
    ));
    ({
      storeId: sellerSecondStoreId,
      productId: secondProductId,
      variantId: secondVariantId,
    } = await seedStore(sellerCookie, `idem-a2-${runId}`));
    ({
      storeId: otherStoreId,
      productId: otherProductId,
      variantId: otherVariantId,
    } = await seedStore(otherCookie, `idem-b-${runId}`));
    ({
      storeId: raceStoreId,
      productId: raceProductId,
      variantId: raceVariantId,
    } = await seedStore(raceCookie, `idem-c-${runId}`));
    storeIds.push(storeId, sellerSecondStoreId, otherStoreId, raceStoreId);
    ({ productId: scarceProductId, variantId: scarceVariantId } =
      await seedScarceProduct(sellerCookie, storeId));
  });

  afterAll(async () => {
    for (const id of storeIds) {
      await prisma.orderItem.deleteMany({ where: { storeId: id } });
      await deleteOrders(prisma, { storeId: id });
      await prisma.auditLog.deleteMany({ where: { storeId: id } });
      await prisma.customer.deleteMany({ where: { storeId: id } });
      await prisma.productVariant.deleteMany({ where: { storeId: id } });
      await prisma.product.deleteMany({ where: { storeId: id } });
      await prisma.notification.deleteMany({ where: { storeId: id } });
      await prisma.paymentMethodConfig.deleteMany({ where: { storeId: id } });
      await prisma.deliveryMethodConfig.deleteMany({ where: { storeId: id } });
      await prisma.store.deleteMany({ where: { id } });
    }
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  const body = (pId = productId, vId = variantId) => ({
    deliveryMethodType: "PICKUP",
    customerPhone: "+51987654321",
    customerName: "Idem",
    items: [{ productId: pId, variantId: vId, quantity: 1 }],
  });

  const post = (
    cookie: string,
    id: string,
    key?: string,
    payload: object = body(),
  ) => {
    const req = request(app.getHttpServer())
      .post(`/stores/${id}/orders/assisted`)
      .set("Cookie", cookie);
    if (key !== undefined) req.set("Idempotency-Key", key);
    return req.send(payload);
  };

  const ordersWithKey = (key: string) =>
    prisma.order.count({ where: { idempotencyKey: key } });
  const reserved = async (id: string) =>
    (await prisma.productVariant.findUniqueOrThrow({ where: { id } })).reserved;

  it("keeps today's behavior without a key: two identical requests create two orders", async () => {
    const before = await prisma.order.count({ where: { storeId } });
    await post(sellerCookie, storeId).expect(201);
    await post(sellerCookie, storeId).expect(201);
    expect(await prisma.order.count({ where: { storeId } })).toBe(before + 2);
  });

  it("rejects a key that is not a UUID with 400 and creates nothing", async () => {
    const before = await prisma.order.count({ where: { storeId } });
    await post(sellerCookie, storeId, "not-a-uuid").expect(400);
    expect(await prisma.order.count({ where: { storeId } })).toBe(before);
  });

  it("answers a sequential replay with 409 IDEMPOTENT_REPLAY naming the first order", async () => {
    const key = randomUUID();
    const first = await post(sellerCookie, storeId, key).expect(201);
    const reservedAfterFirst = await reserved(variantId);

    const replay = await post(sellerCookie, storeId, key).expect(409);
    expect(replay.body).toMatchObject({
      statusCode: 409,
      code: "IDEMPOTENT_REPLAY",
      orderId: first.body.order.id,
    });
    expect(JSON.stringify(replay.body)).not.toContain("accessUrl");
    expect(await ordersWithKey(key)).toBe(1);
    expect(await reserved(variantId)).toBe(reservedAfterFirst);
  });

  it("answers a same-key race with 409 when the winner takes the last unit", async () => {
    const key = randomUUID();
    const scarce = body(scarceProductId, scarceVariantId);
    const results = await Promise.all([
      post(sellerCookie, storeId, key, scarce),
      post(sellerCookie, storeId, key, scarce),
    ]);
    const winner = results.find((result) => result.status === 201);
    const loser = results.find((result) => result.status !== 201);

    expect(winner).toBeDefined();
    expect(loser?.status).toBe(409);
    expect(loser?.body).toMatchObject({
      code: "IDEMPOTENT_REPLAY",
      orderId: winner?.body.order.id,
    });
    expect(await ordersWithKey(key)).toBe(1);
    expect(await reserved(scarceVariantId)).toBe(1);

    // A different key still hits the stock rule.
    await post(sellerCookie, storeId, randomUUID(), scarce).expect(400);
  });

  it("creates exactly one order and one reservation when two identical requests race", async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const key = randomUUID();
      const reservedBefore = await reserved(raceVariantId);

      const results = await Promise.all([
        post(raceCookie, raceStoreId, key, body(raceProductId, raceVariantId)),
        post(raceCookie, raceStoreId, key, body(raceProductId, raceVariantId)),
      ]);

      const statuses = results.map((r) => r.status).sort();
      // One winner and one 409 replay. A loser that reaches the stock update
      // after the winner reserves the last unit must still resolve to replay.
      expect(statuses.filter((s) => s === 201)).toHaveLength(1);
      expect(statuses.filter((s) => s === 409)).toHaveLength(1);
      const loser = results.find((r) => r.status !== 201)!;
      expect(loser.body.code).toBe("IDEMPOTENT_REPLAY");

      expect(await ordersWithKey(key)).toBe(1);
      expect(await reserved(raceVariantId)).toBe(reservedBefore + 1);
    }
  }, 120_000);

  it("treats the same key from another seller or another store as independent", async () => {
    const key = randomUUID();
    await post(sellerCookie, storeId, key).expect(201);
    await post(
      otherCookie,
      otherStoreId,
      key,
      body(otherProductId, otherVariantId),
    ).expect(201);
    // Same seller, different store: also its own key space.
    await post(
      sellerCookie,
      sellerSecondStoreId,
      key,
      body(secondProductId, secondVariantId),
    ).expect(201);
    expect(await ordersWithKey(key)).toBe(3);
  });

  it("cannot replay another seller's key into your own store", async () => {
    const key = randomUUID();
    const mine = await post(sellerCookie, storeId, key).expect(201);
    // The other seller does not own `storeId`: ownership is checked before the
    // key lookup, so the existing order id is never revealed.
    const res = await post(otherCookie, storeId, key).expect(403);
    expect(JSON.stringify(res.body)).not.toContain(mine.body.order.id);
  });

  it("surfaces a real unique violation in the shape isIdempotencyKeyConflict matches", async () => {
    // Probe the actual Prisma 7 + driver-adapter error, not a hand-built one.
    const a = await post(sellerCookie, storeId).expect(201);
    const b = await post(sellerCookie, storeId).expect(201);
    const key = randomUUID();
    await prisma.order.update({
      where: { id: a.body.order.id },
      data: { idempotencyKey: key },
    });
    const err = await prisma.order
      .update({ where: { id: b.body.order.id }, data: { idempotencyKey: key } })
      .then(() => null)
      .catch((e: unknown) => e);
    expect(err).not.toBeNull();
    expect(isIdempotencyKeyConflict(err)).toBe(true);
  });

  it("lets the browser preflight send Idempotency-Key", async () => {
    const res = await request(app.getHttpServer())
      .options(`/stores/${storeId}/orders/assisted`)
      .set("Origin", process.env.WEB_URL ?? "http://localhost:3001")
      .set("Access-Control-Request-Method", "POST")
      .set("Access-Control-Request-Headers", "content-type,idempotency-key");
    expect(res.status).toBeLessThan(300);
    expect(res.headers["access-control-allow-headers"]).toMatch(
      /idempotency-key/i,
    );
  });
});
