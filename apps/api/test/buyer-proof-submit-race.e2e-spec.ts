import { Test, type TestingModule } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { StorageService } from "../src/storage/storage.service.js";
import request from "supertest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AppModule } from "./../src/app.module.js";
import { mailerDevDir, waitForNewMailerFile } from "./schema-assert.js";

// Regression coverage for the over-submission race in
// CustomerOrderPaymentsController.submit (the buyer proof-upload endpoint):
// two concurrent full-balance proofs used to both pass the pre-transaction
// balance check, then both insert PENDING_REVIEW rows — over-submitting the
// order by 2x. The in-transaction re-check under a FOR UPDATE row lock makes
// exactly one succeed and the other 400.
describe("buyer proof submission race (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  let sellerSessionCookie: string;
  let sellerUserId: string;
  let storeId: string;
  let storeSlug: string;
  let productId: string;
  let productVariantId: string;
  let orderId: string | undefined;
  let customerSessionCookie: string;
  let uploadedImageUrl: string | undefined;

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const sellerEmail = `proof-race-seller-${runId}@example.com`;
  const customerEmail = `proof-race-customer-${runId}@example.com`;
  const customerPhone = "+51955555555";
  const password = "correcthorsebatterystaple";

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    storage = moduleFixture.get(StorageService);

    const existingMailerFiles = new Set(readdirSync(mailerDevDir));

    const signUpRes = await request(app.getHttpServer())
      .post("/api/auth/sign-up/email")
      .send({ email: sellerEmail, password, name: "E2E Seller" })
      .expect(200);
    sellerUserId = signUpRes.body.user.id;

    const mailerFile = await waitForNewMailerFile(
      existingMailerFiles,
      sellerEmail,
    );
    const html = readFileSync(mailerFile, "utf-8");
    const tokenMatch = html.match(/verify-email\?token=([^&"]+)/);
    if (!tokenMatch) throw new Error("verification link not found in email");
    await request(app.getHttpServer())
      .get(`/api/auth/verify-email?token=${tokenMatch[1]}`)
      .expect((res) => {
        if (res.status >= 400) {
          throw new Error(`verify-email failed with status ${res.status}`);
        }
      });

    const signInRes = await request(app.getHttpServer())
      .post("/api/auth/sign-in/email")
      .send({ email: sellerEmail, password })
      .expect(200);
    const setCookie = signInRes.headers["set-cookie"] as unknown as string[];
    const raw = setCookie?.find((c) => c.includes("session_token"));
    if (!raw) throw new Error("sign-in did not return a session cookie");
    sellerSessionCookie = raw.split(";")[0]!;

    storeSlug = `proof-race-${runId}`;
    const storeRes = await request(app.getHttpServer())
      .post("/stores")
      .set("Cookie", sellerSessionCookie)
      .send({
        name: "E2E Store",
        slug: storeSlug,
        whatsappNumber: "+51900000000",
      })
      .expect(201);
    storeId = storeRes.body.id;

    const productRes = await request(app.getHttpServer())
      .post(`/stores/${storeId}/products`)
      .set("Cookie", sellerSessionCookie)
      .send({ name: "E2E Product", price: 10, currency: "PEN", stock: 100 })
      .expect(201);
    productId = productRes.body.id;
    productVariantId = productRes.body.variants[0].id;
    await request(app.getHttpServer())
      .patch(`/stores/${storeId}/products/${productId}/publish`)
      .set("Cookie", sellerSessionCookie)
      .expect(200);

    // Buyer-side: checkout with an email so the confirm-account email arrives,
    // then register a password and log in to get the customer session cookie.
    const buyerMailerFiles = new Set(readdirSync(mailerDevDir));

    const checkoutRes = await request(app.getHttpServer())
      .post(`/stores/${storeSlug}/checkout`)
      .send({
        deliveryMethodType: "PICKUP",
        customerPhone,
        customerEmail,
        customerName: "E2E Customer",
        items: [{ productId, variantId: productVariantId, quantity: 1 }],
      })
      .expect(201);
    orderId = checkoutRes.body.order.id as string;

    const buyerMailerFile = await waitForNewMailerFile(
      buyerMailerFiles,
      customerEmail,
    );
    const buyerHtml = readFileSync(buyerMailerFile, "utf-8");
    const registerToken = buyerHtml.match(/token=([^&"]+)/)?.[1];
    if (!registerToken) {
      throw new Error("confirm-account link not found in email");
    }

    await request(app.getHttpServer())
      .post(`/stores/${storeSlug}/account/register`)
      .set("Origin", "http://localhost:3001")
      .send({ token: registerToken, password })
      .expect(201);

    const loginRes = await request(app.getHttpServer())
      .post(`/stores/${storeSlug}/account/login`)
      .set("Origin", "http://localhost:3001")
      .send({ phone: customerPhone, password })
      .expect(201);
    const loginCookie = loginRes.headers["set-cookie"] as unknown as string[];
    const loginRaw = loginCookie?.find((c) => c.includes("bm_customer_session"));
    if (!loginRaw) throw new Error("login did not return a session cookie");
    customerSessionCookie = loginRaw.split(";")[0]!;
  });

  afterAll(async () => {
    if (uploadedImageUrl) {
      await storage.deleteImage(uploadedImageUrl);
    }
    if (orderId) {
      await prisma.orderPayment.deleteMany({ where: { orderId } });
      await prisma.orderItem.deleteMany({ where: { orderId } });
      await prisma.order.deleteMany({ where: { id: orderId } });
    }
    if (storeId) {
      await prisma.notification.deleteMany({ where: { storeId } });
      await prisma.customerStoreLink.deleteMany({ where: { storeId } });
      await prisma.customer.deleteMany({ where: { storeId } });
      await prisma.paymentMethodConfig.deleteMany({ where: { storeId } });
      await prisma.deliveryMethodConfig.deleteMany({ where: { storeId } });
    }
    if (productId) {
      await prisma.productVariant.deleteMany({ where: { productId } });
      await prisma.product.deleteMany({ where: { id: productId } });
    }
    await prisma.buyerAccount.deleteMany({ where: { phone: customerPhone } });
    if (storeId) {
      await prisma.store.deleteMany({ where: { id: storeId } });
    }
    if (sellerUserId) {
      await prisma.user.deleteMany({ where: { id: sellerUserId } });
    }
    await app.close();
  });

  it("two concurrent full-balance proof submissions: exactly one succeeds, the other 400s, and only one PENDING_REVIEW row is created", async () => {
    const server = app.getHttpServer();
    const requiredAmount = "10.00";

    // 1x1 PNG, smallest valid file that passes the magic-byte check.
    const pngBuffer = Buffer.from(
      "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415478da6360606060000000050001a5f645400000000049454e44ae426082",
      "hex",
    );

    const submitProof = () =>
      request(server)
        .post(`/stores/${storeSlug}/account/orders/${orderId}/payments`)
        .set("Cookie", customerSessionCookie)
        .field("amount", requiredAmount)
        .field("method", "YAPE")
        .attach("file", pngBuffer, "proof.png");

    const [res1, res2] = await Promise.all([submitProof(), submitProof()]);

    const statuses = [res1.status, res2.status].sort();
    expect(statuses).toEqual([201, 400]);

    const failed = res1.status === 400 ? res1 : res2;
    expect(failed.body.message).toBe("El monto excede el saldo pendiente");

    const succeeded = res1.status === 201 ? res1 : res2;
    uploadedImageUrl = succeeded.body.imageUrl;

    // Only one BUYER_SUBMITTED PENDING_REVIEW row must exist — the reserve
    // logic prevents the second proof from over-submitting the order.
    const proofs = await prisma.orderPayment.findMany({
      where: { orderId, source: "BUYER_SUBMITTED" },
    });
    expect(proofs).toHaveLength(1);
    expect(proofs[0]!.reviewStatus).toBe("PENDING_REVIEW");
    expect(proofs[0]!.amount.toNumber()).toBe(10);
  });
});
