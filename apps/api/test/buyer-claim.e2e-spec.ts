import { Test, type TestingModule } from "@nestjs/testing";
import { type INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { orderRef } from "@biasmarket/utils/order-ref";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { AppModule } from "./../src/app.module.js";
import { AllExceptionsFilter } from "../src/common/filters/all-exceptions.filter.js";
import {
  ClaimOrderError,
  CustomerAuthService,
} from "../src/modules/customer-auth/customer-auth.service.js";
import {
  CLAIM_TICKET_COOKIE,
  type ClaimTicket,
  verifyClaimTicket,
} from "../src/modules/customer-auth/claim-ticket.js";
import { createOrderAccessToken } from "@biasmarket/utils/assisted-order";
import { createCustomerSessionToken } from "@biasmarket/utils/customer-account-token";
import {
  deleteOrders,
  mailerDevDir,
  waitForNewMailerFile,
} from "./schema-assert.js";

// Claim with Google, against a real database. Google itself is never called:
// the OAuth exchange is replaced by passing a stub identity straight to
// `CustomerAuthService.claimWithGoogle`, and the signed ticket is the one the
// real HTTP endpoint issues. One order is created (checkout is throttled) and
// reset to a claimable state before each case.
describe("claim order with Google (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let auth: CustomerAuthService;
  let sellerCookie: string;
  let userId: string;
  let storeId: string;
  let storeSlug: string;
  let orderId: string;
  let token: string;
  let tokenHash: string;
  const accountIds: string[] = [];

  const runId = randomUUID();
  const password = "correcthorsebatterystaple";
  const ORIGIN = "http://localhost:3001";
  let ipCounter = 0;
  const nextIp = () => `198.51.102.${++ipCounter}`;
  const id = (label: string) => ({
    sub: `sub-${label}-${runId}`,
    email: `claim-${label}-${runId}@example.com`,
    name: `Buyer ${label}`,
  });

  beforeAll(async () => {
    process.env.GOOGLE_CLIENT_ID = "e2e-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "e2e-client-secret";
    process.env.WEB_URL = ORIGIN;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    // Each request gets its own client IP so the per-IP throttle (10/min on
    // the ticket route) does not couple the cases.
    app.getHttpAdapter().getInstance().set("trust proxy", true);
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    auth = moduleFixture.get(CustomerAuthService);

    const email = `claim-seller-${runId}@example.com`;
    const existing = new Set(readdirSync(mailerDevDir));
    const signUp = await request(app.getHttpServer())
      .post("/api/auth/sign-up/email")
      .send({ email, password, name: "E2E Seller" })
      .expect(200);
    userId = signUp.body.user.id;
    const html = readFileSync(
      await waitForNewMailerFile(existing, email),
      "utf-8",
    );
    const verify = html.match(/verify-email\?token=([^&"]+)/)?.[1];
    if (!verify) throw new Error("verification link not found in email");
    await request(app.getHttpServer()).get(
      `/api/auth/verify-email?token=${verify}`,
    );
    const signIn = await request(app.getHttpServer())
      .post("/api/auth/sign-in/email")
      .send({ email, password })
      .expect(200);
    const raw = (signIn.headers["set-cookie"] as unknown as string[]).find(
      (c) => c.includes("session_token"),
    );
    if (!raw) throw new Error("sign-in did not return a session cookie");
    sellerCookie = raw.split(";")[0]!;

    storeSlug = `claim-e2e-${runId}`;
    const store = await request(app.getHttpServer())
      .post("/api/stores")
      .set("Cookie", sellerCookie)
      .send({
        name: "Claim Store",
        slug: storeSlug,
        whatsappNumber: "+51900000000",
      })
      .expect(201);
    storeId = store.body.id;
    const product = await request(app.getHttpServer())
      .post(`/api/stores/${storeId}/products`)
      .set("Cookie", sellerCookie)
      .send({ name: "Album", price: 25, currency: "PEN", stock: 100 })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/stores/${storeId}/products/${product.body.id}/publish`)
      .set("Cookie", sellerCookie)
      .expect(200);

    const checkout = await request(app.getHttpServer())
      .post(`/api/stores/${storeSlug}/checkout`)
      .field("deliveryMethodType", "PICKUP")
      .field("customerPhone", "+51987654321")
      .field(
        "items",
        JSON.stringify([
          {
            productId: product.body.id,
            variantId: product.body.variants[0].id,
            quantity: 1,
          },
        ]),
      )
      .expect(201);
    orderId = checkout.body.order.id;
  });

  afterAll(async () => {
    if (orderId) {
      await prisma.orderPayment.deleteMany({ where: { orderId } });
      await prisma.orderItem.deleteMany({ where: { orderId } });
      await deleteOrders(prisma, { id: orderId });
    }
    if (storeId) {
      await prisma.customerStoreLink.deleteMany({ where: { storeId } });
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
    await prisma.buyerAccount.deleteMany({
      where: {
        OR: [{ id: { in: accountIds } }, { email: { contains: runId } }],
      },
    });
    if (userId) await prisma.user.deleteMany({ where: { id: userId } });
    await app.close();
  });

  // Back to a claimable order with a fresh private link and a recorded
  // payment, so every case starts from the same place.
  async function reset(patch: Record<string, unknown> = {}) {
    const link = createOrderAccessToken();
    token = link.token;
    tokenHash = link.tokenHash;
    await prisma.orderEvent.deleteMany({
      where: { orderId, type: { in: ["CLAIMED"] } },
    });
    await prisma.orderPayment.deleteMany({ where: { orderId } });
    await prisma.order.update({
      where: { id: orderId },
      data: {
        source: "VENDOR_ASSISTED",
        createdByUserId: userId,
        customerPhone: "+51987654321",
        accessTokenHash: tokenHash,
        accessTokenRevokedAt: null,
        claimedAt: null,
        buyerAccountId: null,
        status: "ACTIVE",
        paymentStatus: "VERIFIED",
        ...patch,
      },
    });
    await prisma.orderPayment.create({
      data: {
        orderId,
        storeId,
        amount: 10,
        method: "YAPE",
        currency: "PEN",
        source: "SELLER_RECORDED",
        reviewStatus: "N_A",
      },
    });
  }

  const issueTicket = async (moment?: string): Promise<ClaimTicket> => {
    const res = await request(app.getHttpServer())
      .post(`/api/public/orders/${token}/claim-ticket`)
      .set("Origin", ORIGIN)
      .set("X-Forwarded-For", nextIp())
      .send(moment ? { moment } : {})
      .expect(204);
    const cookie = (res.headers["set-cookie"] as unknown as string[]).find(
      (c) => c.startsWith(`${CLAIM_TICKET_COOKIE}=`),
    )!;
    const ticket = verifyClaimTicket(
      decodeURIComponent(cookie.split(";")[0]!.split("=")[1]!),
    );
    if (!ticket) throw new Error("the endpoint did not issue a valid ticket");
    return ticket;
  };

  const claims = () =>
    prisma.orderEvent.findMany({ where: { orderId, type: "CLAIMED" } });

  it("claims a validated order end to end: account, link, event, public timeline, token still works", async () => {
    await reset();
    const ticket = await issueTicket("pago_validado");
    const who = id("happy");

    const { token: session, orderId: claimedId } = await auth.claimWithGoogle(
      who,
      ticket,
    );
    expect(claimedId).toBe(orderId);
    expect(session.length).toBeGreaterThan(20);

    const account = await prisma.buyerAccount.findUniqueOrThrow({
      where: { googleSub: who.sub },
    });
    accountIds.push(account.id);
    expect(account.email).toBe(who.email);
    expect(account.emailVerified).toBe(true);
    expect(account.phone).toBeNull();

    const row = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(row.buyerAccountId).toBe(account.id);
    expect(row.claimedAt).not.toBeNull();
    expect(row.customerPhone).toBe("+51987654321");
    expect(
      await prisma.customerStoreLink.count({
        where: { buyerAccountId: account.id, storeId },
      }),
    ).toBe(1);

    const events = await claims();
    expect(events).toHaveLength(1);
    expect(events[0]!.payload).toEqual({ moment: "pago_validado" });
    expect(JSON.stringify(events[0])).not.toMatch(
      new RegExp(`${who.email}|${token}|987654321`),
    );

    // The token link keeps working, now with the full timeline.
    const pub = await request(app.getHttpServer())
      .get(`/api/public/orders/${token}`)
      .expect(200);
    expect(pub.body.claimed).toBe(true);
    expect(pub.body.timeline.map((i: { type: string }) => i.type)).toContain(
      "CLAIMED",
    );
    expect(pub.body.orderNumber).toBe(orderRef(orderId));
  });

  it("lets exactly one of two different accounts claim concurrently", async () => {
    await reset();
    const ticket = await issueTicket();
    const a = id("race-a");
    const b = id("race-b");

    const results = await Promise.allSettled([
      auth.claimWithGoogle(a, ticket),
      auth.claimWithGoogle(b, ticket),
    ]);

    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter(
      (r): r is PromiseRejectedResult => r.status === "rejected",
    );
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toBeInstanceOf(ClaimOrderError);
    expect(rejected[0]!.reason).toMatchObject({ code: "already_claimed" });
    expect(await claims()).toHaveLength(1);

    const accounts = await prisma.buyerAccount.findMany({
      where: { googleSub: { in: [a.sub, b.sub] } },
    });
    accountIds.push(...accounts.map((x) => x.id));
    const row = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(accounts.map((x) => x.id)).toContain(row.buyerAccountId);
  });

  it("succeeds for both of two concurrent claims by the SAME account, with one event", async () => {
    await reset();
    const ticket = await issueTicket();
    const who = id("same");

    const results = await Promise.all([
      auth.claimWithGoogle(who, ticket),
      auth.claimWithGoogle(who, ticket),
    ]);

    expect(results).toHaveLength(2);
    expect(await claims()).toHaveLength(1);
    const account = await prisma.buyerAccount.findUniqueOrThrow({
      where: { googleSub: who.sub },
    });
    accountIds.push(account.id);
    expect(
      await prisma.buyerAccount.count({ where: { googleSub: who.sub } }),
    ).toBe(1);
  });

  it("rejects a ticket issued before the seller regenerated the link", async () => {
    await reset();
    const ticket = await issueTicket();

    // The real seller endpoint rotates the hash without revoking it.
    await request(app.getHttpServer())
      .post(`/api/stores/${storeId}/orders/${orderId}/access-link`)
      .set("Cookie", sellerCookie)
      .expect(201);

    await expect(
      auth.claimWithGoogle(id("stale"), ticket),
    ).rejects.toMatchObject({ code: "invalid" });
    const row = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(row.claimedAt).toBeNull();
    expect(await claims()).toHaveLength(0);

    // The old token no longer resolves either.
    await request(app.getHttpServer())
      .post(`/api/public/orders/${token}/claim-ticket`)
      .set("Origin", ORIGIN)
      .set("X-Forwarded-For", nextIp())
      .send({})
      .expect(404);
  });

  it("does not issue a ticket without a validated payment (422), for a cancelled order, or once claimed (409)", async () => {
    await reset();
    await prisma.orderPayment.deleteMany({ where: { orderId } });
    await request(app.getHttpServer())
      .post(`/api/public/orders/${token}/claim-ticket`)
      .set("Origin", ORIGIN)
      .set("X-Forwarded-For", nextIp())
      .send({})
      .expect(422);

    await reset({ status: "CANCELLED", paymentStatus: "CANCELLED" });
    await request(app.getHttpServer())
      .post(`/api/public/orders/${token}/claim-ticket`)
      .set("Origin", ORIGIN)
      .set("X-Forwarded-For", nextIp())
      .send({})
      .expect(422);

    await reset();
    const ticket = await issueTicket();
    const who = id("once");
    await auth.claimWithGoogle(who, ticket);
    accountIds.push(
      (
        await prisma.buyerAccount.findUniqueOrThrow({
          where: { googleSub: who.sub },
        })
      ).id,
    );
    await request(app.getHttpServer())
      .post(`/api/public/orders/${token}/claim-ticket`)
      .set("Origin", ORIGIN)
      .set("X-Forwarded-For", nextIp())
      .send({})
      .expect(409);
  });

  it("never links an unverified same-email account: a new Google account is created", async () => {
    await reset();
    const who = id("hijack");
    const attacker = await prisma.buyerAccount.create({
      data: {
        email: who.email,
        emailVerified: false,
        phone: `+519${Math.floor(Math.random() * 1e8)
          .toString()
          .padStart(8, "0")}`,
        passwordHash: "attacker-known-password-hash",
      },
    });
    accountIds.push(attacker.id);

    await auth.claimWithGoogle(who, await issueTicket());

    const account = await prisma.buyerAccount.findUniqueOrThrow({
      where: { googleSub: who.sub },
    });
    accountIds.push(account.id);
    expect(account.id).not.toBe(attacker.id);
    const untouched = await prisma.buyerAccount.findUniqueOrThrow({
      where: { id: attacker.id },
    });
    expect(untouched.emailVerified).toBe(false);
    expect(untouched.googleSub).toBeNull();
    const row = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(row.buyerAccountId).toBe(account.id);
  });

  it("never links a VERIFIED same-email account either: the order binds to a new Google account", async () => {
    await reset();
    const who = id("verified-clash");
    // The #377 scenario: a checkout-created phone account carrying the
    // victim's email, which the victim then confirmed.
    const existing = await prisma.buyerAccount.create({
      data: {
        email: who.email,
        emailVerified: true,
        phone: `+519${Math.floor(Math.random() * 1e8)
          .toString()
          .padStart(8, "0")}`,
        passwordHash: "attacker-known-password-hash",
      },
    });
    accountIds.push(existing.id);

    await auth.claimWithGoogle(who, await issueTicket());

    const account = await prisma.buyerAccount.findUniqueOrThrow({
      where: { googleSub: who.sub },
    });
    accountIds.push(account.id);
    expect(account.id).not.toBe(existing.id);
    const untouched = await prisma.buyerAccount.findUniqueOrThrow({
      where: { id: existing.id },
    });
    expect(untouched.googleSub).toBeNull();
    expect(untouched.passwordHash).toBe("attacker-known-password-hash");
    const row = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(row.buyerAccountId).toBe(account.id);
  });

  it("blocks correcting the buyer phone once the order is claimed", async () => {
    await reset();
    const who = id("phone");
    await auth.claimWithGoogle(who, await issueTicket());
    accountIds.push(
      (
        await prisma.buyerAccount.findUniqueOrThrow({
          where: { googleSub: who.sub },
        })
      ).id,
    );

    await request(app.getHttpServer())
      .patch(`/api/stores/${storeId}/orders/${orderId}/buyer-phone`)
      .set("Cookie", sellerCookie)
      .send({ customerPhone: "+51911222333" })
      .expect(409);
    const row = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
    });
    expect(row.customerPhone).toBe("+51987654321");
  });

  describe("claimed orders in Mi cuenta", () => {
    const cookieFor = (token: string) => `bm_customer_session=${token}`;

    it("lists and details the claimed order for its owner, hides it from anyone else", async () => {
      await reset();
      // A payment whose proof image must never reach the buyer.
      await prisma.orderPayment.deleteMany({ where: { orderId } });
      await prisma.orderPayment.create({
        data: {
          orderId,
          storeId,
          amount: 10,
          method: "YAPE",
          currency: "PEN",
          source: "BUYER_SUBMITTED",
          reviewStatus: "APPROVED",
          imageUrl: "https://private.example/proof-secret.jpg",
          note: "looks blurry",
          voidReason: "seller free text",
        },
      });
      const who = id("account");
      const { token: session } = await auth.claimWithGoogle(
        who,
        await issueTicket("banner"),
      );
      const account = await prisma.buyerAccount.findUniqueOrThrow({
        where: { googleSub: who.sub },
      });
      accountIds.push(account.id);

      const list = await request(app.getHttpServer())
        .get("/api/account/orders")
        .set("Cookie", cookieFor(session))
        .expect(200);
      const row = list.body.find((o: { id: string }) => o.id === orderId);
      expect(row.source).toBe("VENDOR_ASSISTED");
      expect(row.claimedAt).not.toBeNull();
      expect(row.storeSlug).toBe(storeSlug);

      const detail = await request(app.getHttpServer())
        .get(`/api/account/orders/${orderId}`)
        .set("Cookie", cookieFor(session))
        .expect(200);
      expect(detail.body.source).toBe("VENDOR_ASSISTED");
      expect(
        detail.body.timeline.map((i: { type: string }) => i.type),
      ).toContain("CLAIMED");
      expect(Object.keys(detail.body.payments[0]).sort()).toEqual(
        ["amount", "createdAt", "reviewStatus", "source", "voidedAt"].sort(),
      );
      const body = JSON.stringify(detail.body);
      for (const secret of [
        "proof-secret",
        "blurry",
        "accessToken",
        "987654321",
      ]) {
        expect(body).not.toContain(secret);
      }

      // Another buyer account, a missing id and no session.
      const other = await prisma.buyerAccount.create({
        data: { email: `other-${runId}@example.com`, emailVerified: true },
      });
      accountIds.push(other.id);
      const otherSession = createCustomerSessionToken(
        other.id,
        other.passwordVersion,
        process.env.CUSTOMER_ACCOUNT_TOKEN_SECRET!,
      );
      const foreign = await request(app.getHttpServer())
        .get(`/api/account/orders/${orderId}`)
        .set("Cookie", cookieFor(otherSession))
        .expect(404);
      const missing = await request(app.getHttpServer())
        .get("/api/account/orders/does-not-exist")
        .set("Cookie", cookieFor(otherSession))
        .expect(404);
      expect({ ...foreign.body, path: "", timestamp: "" }).toEqual({
        ...missing.body,
        path: "",
        timestamp: "",
      });
      await request(app.getHttpServer())
        .get(`/api/account/orders/${orderId}`)
        .expect(401);

      // The per-store order detail now carries the real claim time.
      const perStore = await request(app.getHttpServer())
        .get(`/api/stores/${storeSlug}/account/orders/${orderId}`)
        .set("Cookie", cookieFor(session))
        .expect(200);
      expect(perStore.body.claimedAt).not.toBeNull();
    });
  });
});
