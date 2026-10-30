import { Test } from "@nestjs/testing";
import {
  type INestApplication,
  NotFoundException,
  ValidationPipe,
} from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import request from "supertest";
import { Readable } from "node:stream";
import { type Mock, vi } from "vitest";
import { AllExceptionsFilter } from "../../../common/filters/all-exceptions.filter.js";
import { StorageService } from "../../../storage/storage.service.js";
import { BuyerPaymentProofService } from "../application/buyer-payment-proof.service.js";
import { OrderEventsService } from "../application/order-events.service.js";
import { PublicOrderService } from "../application/public-order.service.js";
import { PublicOrderEventsController } from "./public-order-events.controller.js";
import { PublicOrderTokenGuard } from "./public-order-token.guard.js";

const jpeg = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff]),
  Buffer.alloc(512, 0x61),
]);

const order = {
  id: "order-1",
  storeId: "store-1",
  status: "ACTIVE",
  paymentStatus: "PENDING_PAYMENT",
  fulfillmentStatus: "ORDERING",
  requiredAmount: "100.00",
  currency: "PEN",
  expiresAt: null,
  payments: [],
};

describe("PublicOrderEventsController proof upload routes", () => {
  let app: INestApplication;
  let loadForProof: Mock;
  let submit: Mock;
  let getUrl: Mock;
  let getPaymentImageStream: Mock;
  let ipCounter = 0;
  const nextIp = () => `203.0.113.${(ipCounter += 1)}`;

  beforeEach(async () => {
    loadForProof = vi.fn().mockResolvedValue(order);
    submit = vi.fn().mockResolvedValue({
      id: "payment-1",
      amount: { toString: () => "40" },
      createdAt: new Date("2026-10-28T12:00:00.000Z"),
      imageUrl: "https://private.example/secret.jpg",
      operationCode: "SECRET",
    });
    getUrl = vi.fn().mockResolvedValue("https://private.example/p.jpg");
    getPaymentImageStream = vi.fn().mockResolvedValue({
      body: Readable.from(["img"]),
      contentType: "image/jpeg",
    });
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }])],
      controllers: [PublicOrderEventsController],
      providers: [
        PublicOrderTokenGuard,
        { provide: OrderEventsService, useValue: { loadForProof } },
        { provide: BuyerPaymentProofService, useValue: { submit } },
        {
          provide: PublicOrderService,
          useValue: { getBuyerProofImageUrl: getUrl },
        },
        { provide: StorageService, useValue: { getPaymentImageStream } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    app.getHttpAdapter().getInstance().set("trust proxy", 1);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const upload = (token = "tok") =>
    request(app.getHttpServer())
      .post(`/public/orders/${token}/payments`)
      .set("X-Forwarded-For", nextIp())
      .field("amount", "40")
      .field("method", "YAPE")
      .attach("file", jpeg, "proof.jpg");

  describe("POST :token/payments", () => {
    it("hands the guard order and the fields to the service", async () => {
      const res = await upload()
        .field("note", "hola")
        .field("operationCode", "OP1")
        .expect(201);
      expect(loadForProof).toHaveBeenCalledWith("tok");
      expect(submit).toHaveBeenCalledTimes(1);
      const input = submit.mock.calls[0][0];
      expect(input.order).toBe(order);
      expect(input).toMatchObject({
        amount: "40",
        method: "YAPE",
        note: "hola",
        operationCode: "OP1",
      });
      expect(input.file.detectedMimeType).toBe("image/jpeg");
      expect(res.headers["cache-control"]).toBe("no-store");
      expect(res.headers["referrer-policy"]).toBe("no-referrer");
    });

    it("answers an allow-listed body, never the stored row", async () => {
      const res = await upload().expect(201);
      expect(Object.keys(res.body).sort()).toEqual([
        "amount",
        "createdAt",
        "id",
        "reviewStatus",
      ]);
      expect(res.body.reviewStatus).toBe("PENDING_REVIEW");
      expect(JSON.stringify(res.body)).not.toContain("secret");
    });

    it("answers the same 404 for an unknown token even with a bad file", async () => {
      loadForProof.mockRejectedValue(
        new NotFoundException("Pedido no encontrado"),
      );
      const good = await upload("missing").expect(404);
      const bad = await request(app.getHttpServer())
        .post("/public/orders/missing/payments")
        .set("X-Forwarded-For", nextIp())
        // Small on purpose: the server answers 404 before reading the body,
        // and a large upload races the closing socket (EPIPE).
        .attach("file", Buffer.from("MZ not an image"), "x.exe");
      expect(bad.status).toBe(404);
      expect(bad.body.message).toBe(good.body.message);
      expect(bad.body.message).toBe("Pedido no encontrado");
      expect(submit).not.toHaveBeenCalled();
    });

    it("answers 415 for a non-multipart body, only after the token resolved", async () => {
      await request(app.getHttpServer())
        .post("/public/orders/tok/payments")
        .set("X-Forwarded-For", nextIp())
        .send({ amount: "40" })
        .expect(415);
      await request(app.getHttpServer())
        .post("/public/orders/tok/payments")
        .set("X-Forwarded-For", nextIp())
        .expect(415);

      loadForProof.mockRejectedValue(
        new NotFoundException("Pedido no encontrado"),
      );
      await request(app.getHttpServer())
        .post("/public/orders/missing/payments")
        .set("X-Forwarded-For", nextIp())
        .send({ amount: "40" })
        .expect(404);
    });

    it("answers 400 when the file is missing, without calling the service", async () => {
      await request(app.getHttpServer())
        .post("/public/orders/tok/payments")
        .set("X-Forwarded-For", nextIp())
        .field("amount", "40")
        .field("method", "YAPE")
        .expect(400);
      expect(submit).not.toHaveBeenCalled();
    });

    it("rejects a file whose bytes are not an image", async () => {
      await request(app.getHttpServer())
        .post("/public/orders/tok/payments")
        .set("X-Forwarded-For", nextIp())
        .field("amount", "40")
        .field("method", "YAPE")
        .attach("file", Buffer.from("MZ not an image"), "proof.jpg")
        .expect(400);
      expect(submit).not.toHaveBeenCalled();
    });

    it("does not accept a PDF", async () => {
      await request(app.getHttpServer())
        .post("/public/orders/tok/payments")
        .set("X-Forwarded-For", nextIp())
        .field("amount", "40")
        .field("method", "YAPE")
        .attach("file", Buffer.from("%PDF-1.4 x"), "proof.pdf")
        .expect(400);
    });

    it("is throttled at 10 per minute per IP", async () => {
      const ip = nextIp();
      const send = () =>
        request(app.getHttpServer())
          .post("/public/orders/tok/payments")
          .set("X-Forwarded-For", ip)
          .field("amount", "40")
          .field("method", "YAPE")
          .attach("file", jpeg, "proof.jpg");
      // The module limit (1000) is above the route limit, so this proves the
      // route's own @Throttle is what answers 429.
      for (let i = 0; i < 10; i++) await send().expect(201);
      await send().expect(429);
    });
  });

  describe("GET :token/payments/:paymentId/image", () => {
    const get = () =>
      request(app.getHttpServer())
        .get("/public/orders/tok/payments/pay_1/image")
        .set("X-Forwarded-For", nextIp());

    it("streams the buyer proof with hardened headers (no 415 for a GET)", async () => {
      const res = await get().expect(200);
      expect(getUrl).toHaveBeenCalledWith(
        expect.objectContaining({ id: "order-1", storeId: "store-1" }),
        "pay_1",
      );
      expect(getPaymentImageStream).toHaveBeenCalledWith(
        "https://private.example/p.jpg",
      );
      expect(res.headers["content-type"]).toContain("image/jpeg");
      expect(res.headers["cross-origin-resource-policy"]).toBe("cross-origin");
      expect(res.headers["x-content-type-options"]).toBe("nosniff");
      expect(res.headers["content-security-policy"]).toBe(
        "default-src 'none'; sandbox",
      );
      expect(res.headers["cache-control"]).toBe("private, no-store");
      expect(res.headers["referrer-policy"]).toBe("no-referrer");
      expect(res.headers["content-disposition"]).toBe(
        'inline; filename="comprobante.jpg"',
      );
    });

    it("answers 404 for a content type outside the allow-list", async () => {
      getPaymentImageStream.mockResolvedValue({
        body: Readable.from(["<svg/>"]),
        contentType: "image/svg+xml",
      });
      await get().expect(404);
    });

    it("answers 404, not 500, when the stored object is gone", async () => {
      getPaymentImageStream.mockRejectedValue(
        Object.assign(new Error("gone"), { name: "NoSuchKey" }),
      );
      const res = await get().expect(404);
      expect(res.body.message).toBe("Comprobante no encontrado");
    });

    it("answers the same 404 for every miss", async () => {
      getUrl.mockRejectedValue(
        new NotFoundException("Comprobante no encontrado"),
      );
      const a = await get().expect(404);
      loadForProof.mockRejectedValue(
        new NotFoundException("Pedido no encontrado"),
      );
      await get().expect(404);
      expect(a.body.message).toBe("Comprobante no encontrado");
      expect(getPaymentImageStream).not.toHaveBeenCalled();
    });
  });
});
