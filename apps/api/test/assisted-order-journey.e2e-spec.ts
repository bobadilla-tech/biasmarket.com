import { Test, type TestingModule } from "@nestjs/testing";
import {
  RequestMethod,
  ValidationPipe,
  type INestApplication,
} from "@nestjs/common";
import request from "supertest";
import { randomInt, randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { INTERNAL_JOBS_SECRET_HEADER } from "@biasmarket/queue";
import { orderRef } from "@biasmarket/utils/order-ref";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { StorageService } from "../src/storage/storage.service.js";
import { AppModule } from "./../src/app.module.js";
import { AllExceptionsFilter } from "../src/common/filters/all-exceptions.filter.js";
import { CustomerAuthService } from "../src/modules/customer-auth/customer-auth.service.js";
import {
  CLAIM_TICKET_COOKIE,
  verifyClaimTicket,
} from "../src/modules/customer-auth/claim-ticket.js";
import {
  deleteOrders,
  mailerDevDir,
  waitForNewMailerFile,
} from "./schema-assert.js";

// The assisted-order journey over HTTP only (#277): the seller creates the
// order, the buyer opens the private link and sends a proof, the seller
// approves and advances fulfillment, the buyer confirms receipt and claims the
// order, and a second device reads the same link. Nothing is written through
// Prisma to move the state forward; Prisma is used to backdate `expiresAt`
// (the sweep only looks at the clock) and to inspect stored rows. Google is
// never called: the signed claim ticket is the one the real endpoint issues
// and the identity is handed straight to `claimWithGoogle`, as in
// `buyer-claim.e2e-spec.ts`.
describe("assisted order journey (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  let auth: CustomerAuthService;

  const runId = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const password = "correcthorsebatterystaple";
  const ORIGIN = "http://localhost:3001";
  const userIds: string[] = [];
  const storeIds: string[] = [];
  let sellerEmail: string;
  let sellerCookie: string;
  let otherCookie: string;
  let ipCounter = 0;
  let shopCounter = 0;
  const nextIp = () => `198.51.103.${++ipCounter}`;

  // 1x1 PNG, smallest valid file that passes the magic-byte check.
  const png = Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415478da6360606060000000050001a5f645400000000049454e44ae426082",
    "hex",
  );

  // Fresh numbers per run so a reused database never finds a BuyerAccount that
  // skips the Customer upsert under test.
  const freshDigits = () => String(randomInt(1e8)).padStart(8, "0");
  const freshPhone = () => `+519${freshDigits()}`;

  async function signUp(label: string): Promise<{
    email: string;
    cookie: string;
  }> {
    const email = `journey-${label}-${runId}@example.com`;
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
    const verify = html.match(/verify-email\?token=([^&"]+)/)?.[1];
    if (!verify) throw new Error("verification link not found in email");
    await request(app.getHttpServer())
      .get(`/api/auth/verify-email?token=${verify}`)
      .set("X-Forwarded-For", nextIp());
    const signIn = await request(app.getHttpServer())
      .post("/api/auth/sign-in/email")
      .set("X-Forwarded-For", nextIp())
      .send({ email, password })
      .expect(200);
    const raw = (signIn.headers["set-cookie"] as unknown as string[]).find(
      (c) => c.includes("session_token"),
    );
    if (!raw) throw new Error("sign-in did not return a session cookie");
    return { email, cookie: raw.split(";")[0]! };
  }

  interface Shop {
    storeId: string;
    slug: string;
    productId: string;
    variantId: string;
  }

  // A store with one published product of 100 PEN. `methods: 'transfer'`
  // configures TRANSFER so buyers have somewhere to pay; `'none'` disables
  // every method that a fresh store enables (YAPE/PLIN need details, CASH is
  // always "configured"), which is what a store with no usable methods is.
  async function makeShop(
    label: string,
    cookie = sellerCookie,
    methods: "transfer" | "none" = "transfer",
  ): Promise<Shop> {
    const slug = `journey-${label}-${++shopCounter}-${runId}`;
    const store = await request(app.getHttpServer())
      .post("/api/stores")
      .set("Cookie", cookie)
      .send({ name: slug, slug, whatsappNumber: "+51900000000" })
      .expect(201);
    const storeId = store.body.id as string;
    storeIds.push(storeId);

    if (methods === "transfer") {
      await request(app.getHttpServer())
        .post(`/api/stores/${storeId}/payment-methods`)
        .set("Cookie", cookie)
        .send({
          method: "TRANSFER",
          enabled: true,
          details: {
            bankName: "Banco E2E",
            accountNumber: "0011223344",
            accountHolder: "Tienda E2E",
          },
        })
        .expect(201);
    } else {
      for (const method of ["YAPE", "PLIN", "TRANSFER", "CASH"]) {
        await request(app.getHttpServer())
          .post(`/api/stores/${storeId}/payment-methods`)
          .set("Cookie", cookie)
          .send({ method, enabled: false })
          .expect(201);
      }
    }

    const product = await request(app.getHttpServer())
      .post(`/api/stores/${storeId}/products`)
      .set("Cookie", cookie)
      .send({ name: "Album", price: 100, currency: "PEN", stock: 50 })
      .expect(201);
    await request(app.getHttpServer())
      .patch(`/api/stores/${storeId}/products/${product.body.id}/publish`)
      .set("Cookie", cookie)
      .expect(200);
    return {
      storeId,
      slug,
      productId: product.body.id as string,
      variantId: product.body.variants[0].id as string,
    };
  }

  beforeAll(async () => {
    process.env.GOOGLE_CLIENT_ID = "e2e-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "e2e-client-secret";
    process.env.WEB_URL = ORIGIN;
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    // Same prefix and exclusion as main.ts: the sweep lives outside /api.
    app.setGlobalPrefix("api", {
      exclude: [{ path: "internal/*splat", method: RequestMethod.ALL }],
    });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    // Each request gets its own client IP so the per-IP throttles on the
    // public routes do not couple the cases.
    app.getHttpAdapter().getInstance().set("trust proxy", true);
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    storage = moduleFixture.get(StorageService);
    auth = moduleFixture.get(CustomerAuthService);

    // better-auth allows 3 sign-in/sign-up requests per 10 s per IP; every
    // call above carries its own forwarded IP, and each seller signs in once.
    ({ email: sellerEmail, cookie: sellerCookie } = await signUp("a"));
    ({ cookie: otherCookie } = await signUp("b"));
  });

  afterAll(async () => {
    const proofs = await prisma.orderPayment.findMany({
      where: { storeId: { in: storeIds }, imageUrl: { not: null } },
      select: { imageUrl: true },
    });
    for (const proof of proofs) {
      await storage.deleteImage(proof.imageUrl!).catch(() => undefined);
    }
    for (const id of storeIds) {
      await prisma.orderPayment.deleteMany({ where: { storeId: id } });
      await prisma.orderItem.deleteMany({ where: { storeId: id } });
      await deleteOrders(prisma, { storeId: id });
      await prisma.auditLog.deleteMany({ where: { storeId: id } });
      await prisma.customerStoreLink.deleteMany({ where: { storeId: id } });
      await prisma.customer.deleteMany({ where: { storeId: id } });
      await prisma.notification.deleteMany({ where: { storeId: id } });
      await prisma.productVariant.deleteMany({ where: { storeId: id } });
      await prisma.product.deleteMany({ where: { storeId: id } });
      await prisma.paymentMethodConfig.deleteMany({ where: { storeId: id } });
      await prisma.deliveryMethodConfig.deleteMany({ where: { storeId: id } });
      await prisma.store.deleteMany({ where: { id } });
    }
    await prisma.buyerAccount.deleteMany({
      where: { email: { contains: runId } },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  // --- seller / buyer helpers -------------------------------------------

  const createOrder = (
    shop: Shop,
    overrides: Record<string, unknown> = {},
    cookie = sellerCookie,
  ) =>
    request(app.getHttpServer())
      .post(`/api/stores/${shop.storeId}/orders/assisted`)
      .set("Cookie", cookie)
      .send({
        deliveryMethodType: "PICKUP",
        customerPhone: freshPhone(),
        items: [
          { productId: shop.productId, variantId: shop.variantId, quantity: 1 },
        ],
        ...overrides,
      });

  // The private link is the only copy of the token; split it back out.
  async function newOrder(
    shop: Shop,
    overrides: Record<string, unknown> = {},
  ): Promise<{ id: string; token: string; phone: string; accessUrl: string }> {
    const phone = freshPhone();
    const res = await createOrder(shop, {
      customerPhone: phone,
      ...overrides,
    }).expect(201);
    const accessUrl = res.body.accessUrl as string;
    return {
      id: res.body.order.id as string,
      token: new URL(accessUrl).pathname.split("/").pop()!,
      phone,
      accessUrl,
    };
  }

  const publicGet = (token: string, ip = nextIp()) =>
    request(app.getHttpServer())
      .get(`/api/public/orders/${token}`)
      .set("X-Forwarded-For", ip);

  const buyerProof = (token: string, amount: string) =>
    request(app.getHttpServer())
      .post(`/api/public/orders/${token}/payments`)
      .set("X-Forwarded-For", nextIp())
      .field("amount", amount)
      .field("method", "TRANSFER")
      .attach("file", png, "proof.png");

  const sellerOrderUrl = (shop: Shop, orderId: string, tail = "") =>
    `/api/stores/${shop.storeId}/orders/${orderId}${tail}`;

  const approve = (shop: Shop, orderId: string, paymentId: string) =>
    request(app.getHttpServer())
      .patch(sellerOrderUrl(shop, orderId, `/payments/${paymentId}/review`))
      .set("Cookie", sellerCookie)
      .send({ decision: "approve" });

  const advance = (
    shop: Shop,
    orderId: string,
    status: "IN_TRANSIT" | "READY" | "COMPLETED",
  ) =>
    request(app.getHttpServer())
      .patch(sellerOrderUrl(shop, orderId, "/fulfillment"))
      .set("Cookie", sellerCookie)
      .send({ status });

  // Seller-recorded payment (counts as paid at once). TRANSFER needs a capture.
  const recordPayment = (shop: Shop, orderId: string, amount: string) =>
    request(app.getHttpServer())
      .post(sellerOrderUrl(shop, orderId, "/payments"))
      .set("Cookie", sellerCookie)
      .set("X-Forwarded-For", nextIp())
      .field("amount", amount)
      .field("method", "TRANSFER")
      .field("paidAt", new Date().toISOString())
      .attach("file", png, "capture.png");

  const postEvent = (
    token: string,
    type: string,
    moment?: string,
    ip = nextIp(),
  ) =>
    request(app.getHttpServer())
      .post(`/api/public/orders/${token}/events`)
      .set("X-Forwarded-For", ip)
      .send(moment ? { type, moment } : { type });

  const inviteRows = (orderId: string) =>
    prisma.orderEvent.findMany({
      where: {
        orderId,
        type: { in: ["INVITE_SHOWN", "INVITE_CLICKED", "INVITE_DISMISSED"] },
      },
    });

  const timelineTypes = (body: { timeline: { type: string }[] }) =>
    body.timeline.map((item) => item.type);

  // --- journey -----------------------------------------------------------

  it("runs create → open → proof → approve → advance → receipt → claim → other device", async () => {
    const shop = await makeShop("journey");
    const order = await newOrder(shop);
    const number = orderRef(order.id);

    // Open: the first read is the buyer's, it is no-store, and it reveals
    // only the allow-listed projection.
    const opened = await publicGet(order.token).expect(200);
    expect(opened.headers["cache-control"]).toBe("no-store");
    expect(opened.headers["referrer-policy"]).toBe("no-referrer");
    expect(opened.body).toMatchObject({
      orderNumber: number,
      paymentStatus: "PENDING_PAYMENT",
      fulfillmentStatus: "ORDERING",
      status: "ACTIVE",
      claimed: false,
      hasValidatedPayment: false,
      totalAmount: "100",
      requiredAmount: "100",
      receiptConfirmedAt: null,
    });
    // TRANSFER is configured; CASH is always usable; YAPE/PLIN have no
    // details yet, so the buyer is not offered them.
    expect(
      opened.body.paymentMethods
        .map((m: { method: string }) => m.method)
        .sort(),
    ).toEqual(["CASH", "TRANSFER"]);
    const firstOpen = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(firstOpen.linkFirstOpenedAt).not.toBeNull();

    // Proof: a full-balance buyer proof is pending, then the seller approves
    // it and the order verifies on its own.
    const proof = await buyerProof(order.token, "100.00").expect(201);
    const afterProof = await publicGet(order.token).expect(200);
    // A pending proof is not money yet: the status waits for the seller.
    expect(afterProof.body.paymentStatus).toBe("PENDING_PAYMENT");
    expect(afterProof.body.hasValidatedPayment).toBe(false);
    expect(afterProof.body.payments).toEqual([
      expect.objectContaining({
        id: proof.body.id,
        reviewStatus: "PENDING_REVIEW",
        hasProof: true,
      }),
    ]);

    const approved = await approve(shop, order.id, proof.body.id).expect(200);
    expect(approved.body.paymentStatus).toBe("VERIFIED");
    const validated = await publicGet(order.token).expect(200);
    expect(validated.body.paymentStatus).toBe("VERIFIED");
    expect(validated.body.hasValidatedPayment).toBe(true);
    expect(validated.body.paidAmount).toBe(100);
    expect(validated.body.pendingAmount).toBe(0);

    // Receipt is refused until the order is on its way.
    await request(app.getHttpServer())
      .post(`/api/public/orders/${order.token}/receipt`)
      .set("X-Forwarded-For", nextIp())
      .send({})
      .expect(409);

    // A G1 notice is only a log entry: the link keeps its hash and works.
    const hashBefore = (
      await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    ).accessTokenHash;
    await request(app.getHttpServer())
      .post(sellerOrderUrl(shop, order.id, "/buyer-notices"))
      .set("Cookie", sellerCookie)
      .send({ notice: "ASSISTED_PAYMENT_VALIDATED" })
      .expect(204);

    const inTransit = await advance(shop, order.id, "IN_TRANSIT").expect(200);
    expect(inTransit.body.fulfillmentStatus).toBe("IN_TRANSIT");
    await request(app.getHttpServer())
      .post(sellerOrderUrl(shop, order.id, "/buyer-notices"))
      .set("Cookie", sellerCookie)
      .send({ notice: "ASSISTED_IN_TRANSIT" })
      .expect(204);
    const hashAfter = (
      await prisma.order.findUniqueOrThrow({ where: { id: order.id } })
    ).accessTokenHash;
    expect(hashAfter).toBe(hashBefore);
    const stillWorks = await publicGet(order.token).expect(200);
    expect(stillWorks.body.fulfillmentStatus).toBe("IN_TRANSIT");

    // Before the claim the page shows the summary only.
    expect(stillWorks.body.claimed).toBe(false);
    expect(stillWorks.body.timeline).toEqual([]);

    // Receipt: confirmed once, and the delivery invite moment is recorded
    // once for an eligible (validated, unclaimed) order.
    const receipt = await request(app.getHttpServer())
      .post(`/api/public/orders/${order.token}/receipt`)
      .set("X-Forwarded-For", nextIp())
      .send({})
      .expect(200);
    expect(receipt.body.receiptConfirmedAt).toEqual(expect.any(String));
    await postEvent(order.token, "INVITE_SHOWN", "entrega").expect(204);
    await postEvent(order.token, "INVITE_SHOWN", "entrega").expect(204);
    const invites = await inviteRows(order.id);
    expect(invites.map((row) => [row.type, row.payload])).toEqual([
      ["INVITE_SHOWN", { moment: "entrega" }],
    ]);
    expect(invites.every((row) => row.visibleToBuyer === false)).toBe(true);

    const ready = await advance(shop, order.id, "READY").expect(200);
    expect(ready.body.fulfillmentStatus).toBe("READY");
    const completed = await advance(shop, order.id, "COMPLETED").expect(200);
    expect(completed.body.fulfillmentStatus).toBe("COMPLETED");

    // Claim: ticket from the real endpoint, identity straight to the service.
    const ticketRes = await request(app.getHttpServer())
      .post(`/api/public/orders/${order.token}/claim-ticket`)
      .set("Origin", ORIGIN)
      .set("X-Forwarded-For", nextIp())
      .send({ moment: "entrega" })
      .expect(204);
    const cookie = (
      ticketRes.headers["set-cookie"] as unknown as string[]
    ).find((c) => c.startsWith(`${CLAIM_TICKET_COOKIE}=`))!;
    const ticket = verifyClaimTicket(
      decodeURIComponent(cookie.split(";")[0]!.split("=")[1]!),
    );
    expect(ticket?.orderId).toBe(order.id);
    const who = {
      sub: `sub-journey-${runId}`,
      email: `journey-buyer-${runId}@example.com`,
      name: "Journey Buyer",
    };
    const claimed = await auth.claimWithGoogle(who, ticket!);
    expect(claimed.orderId).toBe(order.id);

    // Other device: same link, no cookie, different IP. The full timeline is
    // there now, in order, with nothing the buyer should not see.
    const otherDevice = await publicGet(order.token, "203.0.113.77").expect(
      200,
    );
    expect(otherDevice.body.claimed).toBe(true);
    expect(otherDevice.body.orderNumber).toBe(number);
    expect(otherDevice.body.receiptConfirmedAt).toBe(
      receipt.body.receiptConfirmedAt,
    );
    const types = timelineTypes(otherDevice.body);
    expect(types).toEqual(
      expect.arrayContaining([
        "CREATED",
        "PAYMENT_SUBMITTED",
        "PAYMENT_VALIDATED",
        "FULFILLMENT_ADVANCED",
        "RECEIPT_CONFIRMED",
        "CLAIMED",
      ]),
    );
    expect(
      otherDevice.body.timeline
        .filter(
          (item: { type: string }) => item.type === "FULFILLMENT_ADVANCED",
        )
        .map((item: { toStatus: string }) => item.toStatus),
    ).toEqual(["IN_TRANSIT", "READY", "COMPLETED"]);
    expect(types).not.toEqual(
      expect.arrayContaining(["BUYER_NOTIFIED", "LINK_OPENED"]),
    );
    expect(types.indexOf("CLAIMED")).toBe(types.length - 1);
    const dump = JSON.stringify(otherDevice.body);
    expect(dump).not.toContain(who.email);
    expect(dump).not.toContain(order.phone);

    // A claimed order is no longer an invite funnel.
    await postEvent(order.token, "INVITE_SHOWN", "banner").expect(204);
    expect(await inviteRows(order.id)).toHaveLength(1);
  }, 60_000);

  // --- payments ----------------------------------------------------------

  it("is PARTIALLY_PAID after a pickup deposit and VERIFIED once the rest is paid", async () => {
    const shop = await makeShop("partial");
    const order = await newOrder(shop, {
      paymentMethod: "TRANSFER",
      paymentType: "PARTIAL",
    });

    // Pickup deposit is 30% of 100.
    const before = await publicGet(order.token).expect(200);
    expect(before.body.requiredAmount).toBe("30");
    expect(before.body.paymentStatus).toBe("PENDING_PAYMENT");

    const half = await recordPayment(shop, order.id, "10.00").expect(201);
    expect(half.body.paymentStatus).toBe("PARTIALLY_PAID");
    const partial = await publicGet(order.token).expect(200);
    expect(partial.body).toMatchObject({
      paymentStatus: "PARTIALLY_PAID",
      paidAmount: 10,
      pendingAmount: 20,
      hasValidatedPayment: true,
    });
    expect(partial.body.expiresAt).toEqual(expect.any(String));

    // The deposit is not enough to move on.
    await advance(shop, order.id, "IN_TRANSIT").expect(400);

    const rest = await recordPayment(shop, order.id, "20.00").expect(201);
    expect(rest.body.paymentStatus).toBe("VERIFIED");
    await advance(shop, order.id, "IN_TRANSIT").expect(200);
  });

  it("voids a counted payment, drops back to PENDING_PAYMENT and logs it on the timeline", async () => {
    const shop = await makeShop("void");
    const order = await newOrder(shop, {
      paymentMethod: "TRANSFER",
      paymentType: "PARTIAL",
    });
    const paid = await recordPayment(shop, order.id, "10.00").expect(201);
    const paymentId = (
      paid.body.payments as { id: string; source: string }[]
    ).find((payment) => payment.source === "SELLER_RECORDED")!.id;

    const voidUrl = sellerOrderUrl(
      shop,
      order.id,
      `/payments/${paymentId}/void`,
    );
    await request(app.getHttpServer())
      .patch(voidUrl)
      .set("Cookie", sellerCookie)
      .send({ reason: "" })
      .expect(400);
    const voided = await request(app.getHttpServer())
      .patch(voidUrl)
      .set("Cookie", sellerCookie)
      .send({ reason: "Número de operación equivocado" })
      .expect(200);
    expect(voided.body.paymentStatus).toBe("PENDING_PAYMENT");

    // Twice is refused, and the buyer sees a voided payment that no longer
    // counts, without the seller's reason.
    await request(app.getHttpServer())
      .patch(voidUrl)
      .set("Cookie", sellerCookie)
      .send({ reason: "otra vez" })
      .expect(400);
    const view = await publicGet(order.token).expect(200);
    expect(view.body).toMatchObject({
      paymentStatus: "PENDING_PAYMENT",
      paidAmount: 0,
      hasValidatedPayment: false,
    });
    expect(view.body.payments).toEqual([
      expect.objectContaining({ id: paymentId, voidedAt: expect.any(String) }),
    ]);
    expect(JSON.stringify(view.body)).not.toContain("equivocado");
    const audit = await prisma.auditLog.findFirstOrThrow({
      where: { storeId: shop.storeId, action: "payment.voided" },
    });
    expect(audit.metadata).toMatchObject({
      reason: "Número de operación equivocado",
    });

    // A fully verified order cannot have a payment voided any more.
    const verified = await newOrder(shop);
    const full = await recordPayment(shop, verified.id, "100.00").expect(201);
    expect(full.body.paymentStatus).toBe("VERIFIED");
    const fullPaymentId = (full.body.payments as { id: string }[])[0]!.id;
    await request(app.getHttpServer())
      .patch(
        sellerOrderUrl(shop, verified.id, `/payments/${fullPaymentId}/void`),
      )
      .set("Cookie", sellerCookie)
      .send({ reason: "ya verificado" })
      .expect(400);
  });

  // --- creation ----------------------------------------------------------

  it.each([
    [
      "spaces",
      (d: string) => `9${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`,
    ],
    [
      "country code and spaces",
      (d: string) => `+51 9${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`,
    ],
  ])("normalizes a phone typed with %s at create", async (_label, format) => {
    const shop = await makeShop("phone");
    const digits = freshDigits();
    const res = await createOrder(shop, {
      customerPhone: format(digits),
    }).expect(201);
    expect(res.body.order.customerPhone).toBe(`+519${digits}`);
    const row = await prisma.order.findUniqueOrThrow({
      where: { id: res.body.order.id },
    });
    expect(row.customerPhoneNormalized).toBe(`+519${digits}`);
  });

  // --- public views ------------------------------------------------------

  it("shows no payment methods and no instructions for a store without usable ones", async () => {
    const shop = await makeShop("nomethods", sellerCookie, "none");
    const order = await newOrder(shop);
    const view = await publicGet(order.token).expect(200);
    expect(view.body.paymentMethods).toEqual([]);
    expect(view.body.status).toBe("ACTIVE");
    expect(view.body.orderNumber).toBe(orderRef(order.id));
    expect(view.body.totalAmount).toBe("100");
  });

  it("expires an unpaid and a partially paid order through the real sweep, and offers neither a way to pay nor an invite", async () => {
    const shop = await makeShop("expiry");
    const unpaid = await newOrder(shop);
    const deposit = await newOrder(shop, {
      paymentMethod: "TRANSFER",
      paymentType: "PARTIAL",
    });
    await recordPayment(shop, deposit.id, "10.00").expect(201);
    const live = await newOrder(shop);

    const past = new Date(Date.now() - 60_000);
    await prisma.order.updateMany({
      where: { id: { in: [unpaid.id, deposit.id] } },
      data: { expiresAt: past },
    });

    const sweep = await request(app.getHttpServer())
      .post("/internal/orders/expire-sweep")
      .set(INTERNAL_JOBS_SECRET_HEADER, process.env.INTERNAL_JOBS_SECRET!)
      .expect(200);
    expect(sweep.body.cancelled).toBeGreaterThanOrEqual(2);

    for (const expired of [unpaid, deposit]) {
      const view = await publicGet(expired.token).expect(200);
      expect(view.body).toMatchObject({
        status: "CANCELLED",
        paymentStatus: "CANCELLED",
        paymentMethods: [],
        paymentInstructions: null,
        expiresAt: null,
        closure: { kind: "EXPIRED" },
      });
      // No invite is recorded for an expired order, even with a payment.
      for (const type of ["INVITE_SHOWN", "INVITE_CLICKED"]) {
        await postEvent(expired.token, type, "pago_validado").expect(204);
      }
      expect(await inviteRows(expired.id)).toHaveLength(0);
      // Nor can it be claimed.
      await request(app.getHttpServer())
        .post(`/api/public/orders/${expired.token}/claim-ticket`)
        .set("Origin", ORIGIN)
        .set("X-Forwarded-For", nextIp())
        .send({})
        .expect((res) => {
          if (res.status < 400) throw new Error(`ticket issued: ${res.status}`);
        });
    }

    // The sweep leaves orders whose hold has not run out alone.
    const stillLive = await publicGet(live.token).expect(200);
    expect(stillLive.body.status).toBe("ACTIVE");
  });

  it("records no invite for a cancelled order with a counted payment, and tells the buyer it was cancelled", async () => {
    const shop = await makeShop("cancel");
    const order = await newOrder(shop, {
      paymentMethod: "TRANSFER",
      paymentType: "PARTIAL",
    });
    await recordPayment(shop, order.id, "10.00").expect(201);
    // Positive control: eligible before the cancel.
    await postEvent(order.token, "INVITE_SHOWN", "pago_validado").expect(204);
    expect(await inviteRows(order.id)).toHaveLength(1);

    await request(app.getHttpServer())
      .patch(sellerOrderUrl(shop, order.id, "/cancel"))
      .set("Cookie", sellerCookie)
      .send({ resolution: "REFUNDED", reason: "Sin stock" })
      .expect(200);

    const view = await publicGet(order.token).expect(200);
    expect(view.body).toMatchObject({
      status: "CANCELLED",
      closure: { kind: "CANCELLED" },
      paymentMethods: [],
    });
    for (const [type, moment] of [
      ["INVITE_SHOWN", "banner"],
      ["INVITE_CLICKED", "banner"],
      ["INVITE_SHOWN", "entrega"],
    ] as const) {
      await postEvent(order.token, type, moment).expect(204);
    }
    expect(await inviteRows(order.id)).toHaveLength(1);
  });

  // --- isolation and leaks -----------------------------------------------

  it("keeps stores apart: 403 for a foreign storeId, 404 for a foreign orderId under an own storeId", async () => {
    const shop = await makeShop("iso-a");
    const mine = await makeShop("iso-b", otherCookie);
    const order = await newOrder(shop);
    const proof = await buyerProof(order.token, "100.00").expect(201);

    const as = (
      method: "get" | "patch" | "post",
      storeId: string,
      tail: string,
    ) => {
      const http = request(app.getHttpServer());
      const url = `/api/stores/${storeId}/orders/${order.id}${tail}`;
      return http[method](url).set("Cookie", otherCookie);
    };

    // Someone else's storeId: the ownership check fails before any lookup.
    await as("get", shop.storeId, "").expect(403);
    await as("patch", shop.storeId, "/fulfillment")
      .send({ status: "IN_TRANSIT" })
      .expect(403);
    await as("patch", shop.storeId, `/payments/${proof.body.id}/review`)
      .send({ decision: "approve" })
      .expect(403);
    await as("post", shop.storeId, "/access-link").expect(403);

    // Own storeId, someone else's orderId: not found, never served.
    await as("get", mine.storeId, "").expect(404);
    await as("patch", mine.storeId, "/fulfillment")
      .send({ status: "IN_TRANSIT" })
      .expect(404);
    await as("patch", mine.storeId, `/payments/${proof.body.id}/review`)
      .send({ decision: "approve" })
      .expect(404);
    await as("patch", mine.storeId, `/payments/${proof.body.id}/void`)
      .send({ reason: "x" })
      .expect(404);
    await as("post", mine.storeId, "/access-link").expect(404);
    await as("post", mine.storeId, "/buyer-notices")
      .send({ notice: "ASSISTED_READY" })
      .expect(404);

    // Nothing moved.
    const row = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(row.fulfillmentStatus).toBe("ORDERING");
    expect(row.paymentStatus).toBe("PENDING_PAYMENT");
  });

  it("does not leak seller, other buyers or internals through the public order", async () => {
    const shop = await makeShop("leak");
    const mine = await newOrder(shop);
    const sibling = await newOrder(shop);
    const proof = await buyerProof(mine.token, "100.00").expect(201);
    await approve(shop, mine.id, proof.body.id).expect(200);
    await advance(shop, mine.id, "IN_TRANSIT").expect(200);

    const res = await publicGet(mine.token).expect(200);
    const dump = JSON.stringify(res.body);
    const row = await prisma.order.findUniqueOrThrow({
      where: { id: mine.id },
      select: { accessTokenHash: true, createdByUserId: true },
    });
    for (const secret of [
      sellerEmail,
      mine.token,
      row.accessTokenHash!,
      row.createdByUserId!,
      shop.storeId,
      mine.phone,
      sibling.phone,
      sibling.id,
      "operationCode",
      "imageUrl",
      "buyerAccountId",
    ]) {
      expect(dump).not.toContain(secret);
    }
    expect(res.body.customerPhone).toMatch(/\*/);
    // The buyer-visible payment row carries no image location, only a flag.
    expect(res.body.payments[0]).toMatchObject({ hasProof: true });
    expect(Object.keys(res.body.payments[0]).sort()).toEqual([
      "amount",
      "createdAt",
      "hasProof",
      "id",
      "method",
      "paidAt",
      "reviewStatus",
      "source",
      "voidedAt",
    ]);
  });
});
