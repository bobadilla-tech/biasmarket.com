import { Test, type TestingModule } from "@nestjs/testing";
import { type INestApplication, ValidationPipe } from "@nestjs/common";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { vi } from "vitest";
import { PrismaService } from "../src/prisma/prisma.service.js";
import { StorageService } from "../src/storage/storage.service.js";
import { AppModule } from "../src/app.module.js";
import { AllExceptionsFilter } from "../src/common/filters/all-exceptions.filter.js";
import {
  deleteOrders,
  mailerDevDir,
  waitForNewMailerFile,
} from "./schema-assert.js";

describe("checkout idempotency race (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: StorageService;
  let userId: string;
  let storeId: string;
  let storeSlug: string;
  let productId: string;
  let variantId: string;
  const runId = randomUUID();
  const email = `checkout-replay-${runId}@example.com`;
  const uploadedImages: string[] = [];
  let ipCounter = 0;
  const nextIp = () => `198.51.104.${++ipCounter}`;

  const png = Buffer.from(
    "89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415478da6360606060000000050001a5f645400000000049454e44ae426082",
    "hex",
  );

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix("api");
    app.getHttpAdapter().getInstance().set("trust proxy", 1);
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
    prisma = moduleFixture.get(PrismaService);
    storage = moduleFixture.get(StorageService);

    const password = "correcthorsebatterystaple";
    const existingMailerFiles = new Set(readdirSync(mailerDevDir));
    const signUp = await request(app.getHttpServer())
      .post("/api/auth/sign-up/email")
      .send({ email, password, name: "Replay race" })
      .expect(200);
    userId = signUp.body.user.id;
    const html = readFileSync(
      await waitForNewMailerFile(existingMailerFiles, email),
      "utf8",
    );
    const token = html.match(/verify-email\?token=([^&"]+)/)?.[1];
    if (!token) throw new Error("verification link not found in email");
    await request(app.getHttpServer())
      .get(`/api/auth/verify-email?token=${token}`)
      .expect((res) => {
        if (res.status >= 400) throw new Error(`verify-email ${res.status}`);
      });
    const signIn = await request(app.getHttpServer())
      .post("/api/auth/sign-in/email")
      .send({ email, password })
      .expect(200);
    const raw = (signIn.headers["set-cookie"] as unknown as string[]).find(
      (cookie) => cookie.includes("session_token"),
    );
    if (!raw) throw new Error("sign-in did not return a session cookie");
    const sessionCookie = raw.split(";")[0]!;

    storeSlug = `checkout-replay-${runId}`;
    const store = await request(app.getHttpServer())
      .post("/api/stores")
      .set("Cookie", sessionCookie)
      .send({
        name: "Replay race",
        slug: storeSlug,
        whatsappNumber: "+51999000000",
      })
      .expect(201);
    storeId = store.body.id;
    const product = await request(app.getHttpServer())
      .post(`/api/stores/${storeId}/products`)
      .set("Cookie", sessionCookie)
      .send({ name: "Replay product", price: 25, currency: "PEN", stock: 20 })
      .expect(201);
    productId = product.body.id;
    variantId = product.body.variants[0].id;
    await request(app.getHttpServer())
      .patch(`/api/stores/${storeId}/products/${productId}/publish`)
      .set("Cookie", sessionCookie)
      .expect(200);
    await prisma.deliveryMethodConfig.create({
      data: { storeId, type: "PICKUP", details: { estimatedCost: 0 } },
    });
    await prisma.paymentMethodConfig.create({
      data: {
        storeId,
        method: "YAPE",
        details: { phoneNumber: "999000000" },
      },
    });
  });

  afterAll(async () => {
    const payments = await prisma.orderPayment.findMany({
      where: { storeId, imageUrl: { not: null } },
      select: { imageUrl: true },
    });
    for (const image of new Set([
      ...uploadedImages,
      ...payments.map((payment) => payment.imageUrl!),
    ])) {
      await storage.deleteImage(image).catch(() => undefined);
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

  afterEach(() => vi.restoreAllMocks());

  it("returns one order to both retries and deletes the losing uploaded proof", async () => {
    const originalUpload = storage.uploadPaymentImage.bind(storage);
    let uploaded = 0;
    let pendingUploads = 0;
    const createBarrier = () => {
      let release!: () => void;
      const ready = new Promise<void>((resolve) => {
        release = resolve;
      });
      return { ready, release };
    };
    let barrier = createBarrier();
    const deleteSpy = vi.spyOn(storage, "deleteImage");
    vi.spyOn(storage, "uploadPaymentImage").mockImplementation(
      async (buffer, mimeType) => {
        const imageUrl = await originalUpload(buffer, mimeType);
        uploadedImages.push(imageUrl);
        uploaded += 1;
        const currentBarrier = barrier;
        pendingUploads += 1;
        if (pendingUploads === 2) {
          currentBarrier.release();
          barrier = createBarrier();
          pendingUploads = 0;
        }
        await currentBarrier.ready;
        return imageUrl;
      },
    );

    for (let round = 0; round < 3; round += 1) {
      const idempotencyKey = randomUUID();
      const requestCheckout = () => {
        return request(app.getHttpServer())
          .post(`/api/stores/${storeSlug}/checkout`)
          .set("X-Forwarded-For", nextIp())
          .set("Idempotency-Key", idempotencyKey)
          .field("deliveryMethodType", "PICKUP")
          .field("paymentMethod", "YAPE")
          .field("paymentType", "FULL")
          .field("customerPhone", `+5190000000${round}`)
          .field("customerName", "Retry buyer")
          .field(
            "items",
            JSON.stringify([{ productId, variantId, quantity: 1 }]),
          )
          .attach("file", png, "proof.png");
      };

      const results = await Promise.all([requestCheckout(), requestCheckout()]);
      expect(results.map((result) => result.status)).toEqual([201, 201]);
      expect(results[0]!.body.order.id).toBe(results[1]!.body.order.id);
      const orderId = results[0]!.body.order.id as string;
      expect(
        await prisma.order.count({
          where: { storeId, checkoutIdempotencyKey: idempotencyKey },
        }),
      ).toBe(1);
      const payments = await prisma.orderPayment.findMany({
        where: { orderId },
        select: { imageUrl: true },
      });
      expect(payments).toHaveLength(1);
      const winnerImage = payments[0]!.imageUrl!;
      const roundImages = uploadedImages.slice(round * 2, round * 2 + 2);
      const loserImage = roundImages.find((image) => image !== winnerImage);
      expect(roundImages).toHaveLength(2);
      expect(loserImage).toBeDefined();
      expect(deleteSpy).toHaveBeenCalledWith(loserImage);
    }
  }, 60_000);
});
