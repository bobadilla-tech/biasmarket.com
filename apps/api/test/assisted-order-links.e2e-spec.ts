import { Test, type TestingModule } from "@nestjs/testing";
import { type INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { orderRef } from "@biasmarket/utils/order-ref";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { createOrderAccessToken } from "@biasmarket/utils/assisted-order";
import type { PaymentStatus } from "@biasmarket/db";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { AppModule } from "./../src/app.module.js";
import {
  deleteOrders,
  mailerDevDir,
  waitForNewMailerFile,
} from "./schema-assert.js";

// Seller actions on the private link of an assisted order: regenerate
// (POST access-link) and correct the buyer number (PATCH buyer-phone), plus
// the first-open guard on the public read.
describe("assisted order links (e2e)", () => {
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
  let ipCounter = 0;

  const nextIp = () => `198.51.102.${++ipCounter}`;

  async function signUp(label: string): Promise<string> {
    const email = `links-${label}-${runId}@example.com`;
    const existing = new Set(readdirSync(mailerDevDir));
    const res = await request(app.getHttpServer())
      .post("/api/auth/sign-up/email")
      .send({ email, password, name: `Seller ${label}` })
      .expect(200);
    userIds.push(res.body.user.id);
    const html = readFileSync(
      await waitForNewMailerFile(existing, email),
      "utf-8",
    );
    const token = html.match(/verify-email\?token=([^&"]+)/)?.[1];
    if (!token) throw new Error("verification link not found in email");
    await request(app.getHttpServer()).get(
      `/api/auth/verify-email?token=${token}`,
    );
    const signIn = await request(app.getHttpServer())
      .post("/api/auth/sign-in/email")
      .send({ email, password })
      .expect(200);
    const raw = (signIn.headers["set-cookie"] as unknown as string[]).find(
      (c) => c.includes("session_token"),
    );
    if (!raw) throw new Error("sign-in did not return a session cookie");
    return raw.split(";")[0]!;
  }

  async function seedStore(cookie: string, slug: string) {
    const res = await request(app.getHttpServer())
      .post("/stores")
      .set("Cookie", cookie)
      .send({ name: slug, slug, whatsappNumber: "+51900000000" })
      .expect(201);
    storeIds.push(res.body.id);
    return res.body.id as string;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.getHttpAdapter().getInstance().set("trust proxy", true);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
    prisma = moduleFixture.get(PrismaService);

    sellerCookie = await signUp("a");
    otherCookie = await signUp("b");
    storeId = await seedStore(sellerCookie, `links-a-${runId}`);
    otherStoreId = await seedStore(otherCookie, `links-b-${runId}`);
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
    overrides: {
      storeId?: string;
      source?: "MARKETPLACE" | "VENDOR_ASSISTED";
      status?: "ACTIVE" | "CANCELLED";
      paymentStatus?: PaymentStatus;
      expiresAt?: Date;
      phone?: string;
      linkFirstOpenedAt?: Date;
      claimedAt?: Date;
      customerName?: string;
    } = {},
  ) {
    const { token, tokenHash } = createOrderAccessToken();
    const phone = overrides.phone ?? "+51987000111";
    const order = await prisma.order.create({
      data: {
        storeId: overrides.storeId ?? storeId,
        customerPhone: phone,
        customerPhoneNormalized: phone,
        customerName: overrides.customerName ?? "Sofi",
        source: overrides.source ?? "VENDOR_ASSISTED",
        createdByUserId: userIds[0],
        accessTokenHash: tokenHash,
        status: overrides.status ?? "ACTIVE",
        paymentStatus: overrides.paymentStatus ?? "PENDING_PAYMENT",
        deliveryMethodType: "PICKUP",
        deliveryDetails: {},
        totalAmount: 50,
        requiredAmount: 50,
        currency: "PEN",
        expiresAt: overrides.expiresAt ?? new Date(Date.now() + 3_600_000),
        linkFirstOpenedAt: overrides.linkFirstOpenedAt,
        claimedAt: overrides.claimedAt,
      },
    });
    return { id: order.id, token };
  }

  const regenerate = (
    orderId: string,
    cookie = sellerCookie,
    target = storeId,
  ) =>
    request(app.getHttpServer())
      .post(`/stores/${target}/orders/${orderId}/access-link`)
      .set("Cookie", cookie);

  const correct = (
    orderId: string,
    customerPhone: string,
    cookie = sellerCookie,
    target = storeId,
  ) =>
    request(app.getHttpServer())
      .patch(`/stores/${target}/orders/${orderId}/buyer-phone`)
      .set("Cookie", cookie)
      .send({ customerPhone });

  const open = (token: string) =>
    request(app.getHttpServer())
      .get(`/public/orders/${token}`)
      .set("X-Forwarded-For", nextIp());

  const tokenOf = (accessUrl: string) => accessUrl.split("/").pop()!;

  describe("regenerate", () => {
    it("rotates the token, kills the old link and records the event", async () => {
      const { id, token } = await seedOrder();
      const res = await regenerate(id).expect(201);
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.headers["referrer-policy"]).toBe("no-referrer");
      const fresh = tokenOf(res.body.accessUrl);
      expect(fresh).not.toBe(token);
      expect(res.body.order.id).toBe(id);
      expect(res.body.order.linkFirstOpenedAt).toBeNull();
      expect(res.body.order.createdByName).toBe("Seller a");

      await open(token).expect(404);
      await open(fresh).expect(200);

      const events = await prisma.orderEvent.findMany({
        where: { orderId: id, type: "LINK_REGENERATED" },
      });
      expect(events).toHaveLength(1);
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { entityId: id, action: "order.link_regenerated" },
      });
      const serialized = JSON.stringify([
        audit.metadata,
        events.map(({ payload }) => payload),
      ]);
      expect(serialized).not.toContain(fresh);
      expect(serialized).not.toMatch(/\d{8,}/);
    });

    it("leaves exactly one valid token after parallel regenerates", async () => {
      const { id } = await seedOrder();
      const [a, b] = await Promise.all([regenerate(id), regenerate(id)]);
      expect([a.status, b.status]).toEqual([201, 201]);
      const statuses = await Promise.all([
        open(tokenOf(a.body.accessUrl)),
        open(tokenOf(b.body.accessUrl)),
      ]);
      expect(statuses.map((r) => r.status).sort()).toEqual([200, 404]);
    });

    it.each([
      ["status CANCELLED", { status: "CANCELLED" as const }],
      ["paymentStatus CANCELLED", { paymentStatus: "CANCELLED" as const }],
      ["hold order past expiresAt", { expiresAt: new Date(Date.now() - 1000) }],
      ["hold order expiring right now", { expiresAt: new Date() }],
      [
        "partially paid past expiresAt",
        {
          paymentStatus: "PARTIALLY_PAID" as const,
          expiresAt: new Date(Date.now() - 1000),
        },
      ],
    ])("answers 409 for %s", async (_label, overrides) => {
      const { id } = await seedOrder(overrides);
      const before = await prisma.order.findUniqueOrThrow({ where: { id } });
      await regenerate(id).expect(409);
      const after = await prisma.order.findUniqueOrThrow({ where: { id } });
      expect(after.accessTokenHash).toBe(before.accessTokenHash);
    });

    it("allows a VERIFIED order whose expiresAt is in the past", async () => {
      const { id } = await seedOrder({
        paymentStatus: "VERIFIED",
        expiresAt: new Date(Date.now() - 86_400_000),
      });
      await regenerate(id).expect(201);
    });

    it("answers the same 404 for foreign, missing and marketplace orders", async () => {
      const foreign = await seedOrder({ storeId: otherStoreId });
      const marketplace = await seedOrder({ source: "MARKETPLACE" });
      const bodies = await Promise.all([
        regenerate(foreign.id).expect(404),
        regenerate("does-not-exist").expect(404),
        regenerate(marketplace.id).expect(404),
      ]);
      expect(new Set(bodies.map((r) => JSON.stringify(r.body))).size).toBe(1);
      // The foreign order was not rotated.
      const row = await prisma.order.findUniqueOrThrow({
        where: { id: foreign.id },
      });
      expect(row.accessTokenRevokedAt).toBeNull();
      await open(foreign.token).expect(200);
    });

    it("requires ownership of the store", async () => {
      const { id } = await seedOrder();
      await regenerate(id, otherCookie).expect(403);
      await request(app.getHttpServer())
        .post(`/stores/${storeId}/orders/${id}/access-link`)
        .expect(401);
    });
  });

  describe("correct buyer phone", () => {
    it("moves the order to the right number and rotates the link", async () => {
      const { id, token } = await seedOrder({ phone: "+51987000222" });
      const res = await correct(id, "999 111 222").expect(200);
      expect(res.headers["cache-control"]).toBe("no-store");
      const fresh = tokenOf(res.body.accessUrl);

      const row = await prisma.order.findUniqueOrThrow({ where: { id } });
      expect(row.customerPhone).toBe("+51999111222");
      expect(row.customerPhoneNormalized).toBe("+51999111222");
      expect(row.customerName).toBe("Sofi");
      const customer = await prisma.customer.findUniqueOrThrow({
        where: { storeId_phone: { storeId, phone: "+51999111222" } },
      });
      expect(row.customerId).toBe(customer.id);
      expect(customer.name).toBeNull();

      await open(token).expect(404);
      await open(fresh).expect(200);

      const events = await prisma.orderEvent.findMany({
        where: { orderId: id, type: "PHONE_CORRECTED" },
      });
      expect(events).toHaveLength(1);
      const audit = await prisma.auditLog.findFirstOrThrow({
        where: { entityId: id, action: "order.phone_corrected" },
      });
      const serialized = JSON.stringify([
        audit.metadata,
        events.map(({ payload }) => payload),
      ]);
      expect(serialized).not.toMatch(/\d{8,}/);
      expect(serialized).not.toContain(fresh);
      expect(serialized).not.toContain("Sofi");
    });

    it("keeps the wrong-number contact and links a registered one without changing it", async () => {
      const wrong = await prisma.customer.create({
        data: { storeId, phone: "+51987000333" },
      });
      const registered = await prisma.customer.create({
        data: {
          storeId,
          phone: "+51999333444",
          name: "Registered",
          email: "reg@example.com",
          emailVerified: true,
          passwordHash: "hash",
        },
      });
      const { id } = await seedOrder({ phone: "+51987000333" });
      await prisma.order.update({
        where: { id },
        data: { customerId: wrong.id },
      });
      await correct(id, "+51999333444").expect(200);

      const row = await prisma.order.findUniqueOrThrow({ where: { id } });
      expect(row.customerId).toBe(registered.id);
      expect(
        await prisma.customer.findUniqueOrThrow({
          where: { id: registered.id },
        }),
      ).toEqual(registered);
      expect(
        await prisma.customer.findUnique({ where: { id: wrong.id } }),
      ).not.toBeNull();
    });

    it("refuses once the buyer opened or claimed the order, or when the order is closed", async () => {
      const opened = await seedOrder({ linkFirstOpenedAt: new Date() });
      const claimed = await seedOrder({ claimedAt: new Date() });
      const cancelled = await seedOrder({ status: "CANCELLED" });
      const expired = await seedOrder({
        expiresAt: new Date(Date.now() - 1000),
      });
      for (const o of [opened, claimed, cancelled, expired]) {
        await correct(o.id, "+51999555666").expect(409);
        const row = await prisma.order.findUniqueOrThrow({
          where: { id: o.id },
        });
        expect(row.customerPhone).toBe("+51987000111");
      }
    });

    it("answers 400 for the same number and for invalid numbers", async () => {
      const { id } = await seedOrder({ phone: "+51987000444" });
      await correct(id, "987000444").expect(400);
      await correct(id, "abc").expect(400);
      await correct(id, "").expect(400);
    });

    it("answers the same 404 for foreign, missing and marketplace orders", async () => {
      const foreign = await seedOrder({ storeId: otherStoreId });
      const marketplace = await seedOrder({ source: "MARKETPLACE" });
      const bodies = await Promise.all([
        correct(foreign.id, "+51999777888").expect(404),
        correct("does-not-exist", "+51999777888").expect(404),
        correct(marketplace.id, "+51999777888").expect(404),
      ]);
      expect(new Set(bodies.map((r) => JSON.stringify(r.body))).size).toBe(1);
      await correct(foreign.id, "+51999777888", otherCookie).expect(403);
    });

    it("is consistent when the buyer opens the link while the seller corrects the number", async () => {
      for (let i = 0; i < 4; i++) {
        const { id, token } = await seedOrder({ phone: "+51987000555" });
        const [fix] = await Promise.all([
          correct(id, "+51999000555"),
          open(token),
        ]);
        const row = await prisma.order.findUniqueOrThrow({ where: { id } });
        if (fix.status === 200) {
          expect(row.customerPhone).toBe("+51999000555");
          expect(row.linkFirstOpenedAt).toBeNull();
        } else {
          expect(fix.status).toBe(409);
          expect(row.customerPhone).toBe("+51987000555");
          expect(row.linkFirstOpenedAt).not.toBeNull();
        }
      }
    });
  });

  describe("public link", () => {
    it("stamps the first open once and exposes no seller-only data", async () => {
      const { id, token } = await seedOrder();
      const res = await open(token).expect(200);
      const serialized = JSON.stringify(res.body);
      expect(res.body.customerAlias).toBe("Sofi");
      expect(res.body.orderNumber).toBe(orderRef(id));
      expect(new Date(res.body.createdAt).toISOString()).toBe(
        res.body.createdAt,
      );
      for (const key of [
        "id",
        "orderId",
        "storeId",
        "customerId",
        "createdByName",
        "createdByUserId",
        "linkFirstOpenedAt",
        "claimedAt",
        "accessTokenHash",
      ]) {
        expect(res.body).not.toHaveProperty(key);
      }
      expect(serialized).not.toContain(id);
      expect(serialized).not.toContain("createdBy");
      expect(serialized).not.toContain("Seller a");
      expect(serialized).not.toContain("@");
      await open(token).expect(200);
      const row = await prisma.order.findUniqueOrThrow({ where: { id } });
      expect(row.linkFirstOpenedAt).not.toBeNull();
      expect(
        await prisma.orderEvent.count({
          where: { orderId: id, type: "LINK_OPENED" },
        }),
      ).toBe(1);
    });

    it("shows the same 404 for a malformed token as for an unknown one", async () => {
      const unknown = await open(createOrderAccessToken().token).expect(404);
      const malformed = await open("x".repeat(4000)).expect(404);
      expect(malformed.body.message).toBe(unknown.body.message);
    });

    it("a stale-token first open racing a rotation stamps nothing", async () => {
      const { id, token } = await seedOrder();
      const { tokenHash: freshHash } = createOrderAccessToken();
      let stale: Promise<request.Response> | undefined;
      // Hold the row the way the regenerate use case does, start the open
      // with the old token, and rotate only once the open's conditional
      // update is queued behind our lock.
      await prisma.$transaction(
        async (tx) => {
          await tx.$queryRaw`SELECT id FROM "Order" WHERE id = ${id} FOR UPDATE`;
          stale = open(token).then((r) => r);
          for (let i = 0; i < 100; i++) {
            const [{ waiting }] = await tx.$queryRaw<{ waiting: bigint }[]>`
            SELECT count(*) AS waiting FROM pg_stat_activity
            WHERE wait_event_type = 'Lock' AND query ILIKE '%UPDATE "Order"%'`;
            if (waiting > 0n) break;
            await new Promise((r) => setTimeout(r, 50));
          }
          await tx.order.update({
            where: { id },
            data: { accessTokenHash: freshHash, accessTokenRevokedAt: null },
          });
        },
        { timeout: 15_000 },
      );
      expect((await stale!).status).toBe(200);
      const row = await prisma.order.findUniqueOrThrow({ where: { id } });
      expect(row.linkFirstOpenedAt).toBeNull();
      expect(
        await prisma.orderEvent.count({
          where: { orderId: id, type: "LINK_OPENED" },
        }),
      ).toBe(0);
    }, 20_000);

    it("shows the opened and claimed timestamps and the creator to the seller", async () => {
      const { id, token } = await seedOrder();
      await open(token).expect(200);
      const res = await request(app.getHttpServer())
        .get(`/stores/${storeId}/orders/${id}`)
        .set("Cookie", sellerCookie)
        .expect(200);
      expect(res.body.linkFirstOpenedAt).not.toBeNull();
      expect(res.body.claimedAt).toBeNull();
      expect(res.body.createdByName).toBe("Seller a");
      expect(res.body.createdByUserId).toBeUndefined();
      expect(res.body.accessTokenHash).toBeUndefined();
    });
  });
});
