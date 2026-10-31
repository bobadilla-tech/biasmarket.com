import { Test } from "@nestjs/testing";
import {
  type INestApplication,
  NotFoundException,
  ValidationPipe,
} from "@nestjs/common";
import { ThrottlerModule } from "@nestjs/throttler";
import request from "supertest";
import { vi } from "vitest";

vi.mock("@thallesp/nestjs-better-auth", async () => {
  const { createParamDecorator } = await import("@nestjs/common");
  return {
    AuthGuard: class AuthGuard {},
    Public: () => () => undefined,
    Session: createParamDecorator(() => ({ user: { id: "user-1" } })),
  };
});

import { AllExceptionsFilter } from "../../../common/filters/all-exceptions.filter.js";
import { StorageService } from "../../../storage/storage.service.js";
import { PaymentConfigService } from "../../payment-config/payment-config.service.js";
import { CreateOrderUseCase } from "../application/create-order.usecase.js";
import { CheckoutController } from "./checkout.controller.js";

const MB = 1024 * 1024;

// JPEG magic bytes are all the validation pipe looks at.
function jpeg(size: number): Buffer {
  const buf = Buffer.alloc(size, 0x61);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  return buf;
}

// The use case throws this once the interceptor, the file pipe and the DTO
// validation have passed, so a 404 with this message means "got through".
const REACHED_HANDLER = "reached-handler";

describe("checkout upload limits", () => {
  let app: INestApplication;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 1000 }])],
      controllers: [CheckoutController],
      providers: [
        {
          provide: CreateOrderUseCase,
          useValue: {
            execute: vi
              .fn()
              .mockRejectedValue(new NotFoundException(REACHED_HANDLER)),
          },
        },
        {
          provide: StorageService,
          useValue: {
            uploadPaymentImage: vi.fn().mockResolvedValue("https://img/x"),
          },
        },
        {
          provide: PaymentConfigService,
          useValue: { findEnabledForSlug: vi.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();
    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    app.useGlobalFilters(new AllExceptionsFilter());
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  // Realistic multipart body: the scalar DTO fields plus one `items` field
  // per cart line, like the Orval client sends them.
  function checkout(lines = 20) {
    let req = request(app.getHttpServer())
      .post("/stores/demo/checkout")
      .field("deliveryMethodType", "PICKUP")
      .field("paymentMethod", "YAPE")
      .field("paymentType", "FULL")
      .field("customerPhone", "999888777")
      .field("customerName", "Ana")
      .field("customerEmail", "ana@example.com")
      .field("pickupPointId", "pp-1")
      .field("pickupDate", "2026-12-01");
    for (let i = 0; i < lines; i++) {
      req = req.field(
        "items",
        JSON.stringify({ productId: `prod-${i}`, quantity: 1 }),
      );
    }
    return req;
  }

  const expectReached = (res: request.Response) => {
    expect(res.status).toBe(404);
    expect(res.body.message).toBe(REACHED_HANDLER);
  };

  it("lets a 20-line cart with a proof through to the handler", async () => {
    expectReached(await checkout(20).attach("file", jpeg(1024), "proof.jpg"));
  });

  it("accepts exactly 50 cart lines and rejects 60 with a 400", async () => {
    expectReached(await checkout(50).attach("file", jpeg(1024), "proof.jpg"));
    const res = await checkout(60).attach("file", jpeg(1024), "proof.jpg");
    expect(res.status).toBe(400);
  });

  it("accepts exactly 5 MB", async () => {
    expectReached(await checkout().attach("file", jpeg(5 * MB), "proof.jpg"));
  });

  it("answers the validation pipe 400 for 5 MB + 1 byte, not a 413", async () => {
    const res = await checkout().attach("file", jpeg(5 * MB + 1), "proof.jpg");
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("Máximo 5MB");
  });

  it("cuts off a 6 MB file with a 413", async () => {
    const res = await checkout().attach("file", jpeg(6 * MB), "proof.jpg");
    expect(res.status).toBe(413);
  });

  it("rejects 1000 text fields with a 400", async () => {
    let req = checkout(1);
    for (let i = 0; i < 1000; i++) req = req.field(`extra${i}`, "x");
    const res = await req.attach("file", jpeg(1024), "proof.jpg");
    expect(res.status).toBe(400);
  });

  it("rejects an oversized text field with a 400", async () => {
    const res = await checkout()
      .field("customerName", "x".repeat(9000))
      .attach("file", jpeg(1024), "proof.jpg");
    expect(res.status).toBe(400);
  });

  it("rejects a second file with a 400", async () => {
    const res = await checkout()
      .attach("file", jpeg(1024), "a.jpg")
      .attach("file", jpeg(1024), "b.jpg");
    expect(res.status).toBe(400);
  });

  it("rejects an unexpected file field name with a 400", async () => {
    const res = await checkout().attach("other", jpeg(1024), "proof.jpg");
    expect(res.status).toBe(400);
  });
});
