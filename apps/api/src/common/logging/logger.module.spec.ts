import { Controller, Get, NotFoundException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { Writable } from "node:stream";
import { Logger, LoggerModule } from "nestjs-pino";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { buildLoggerParams } from "./logger.config.js";

const TOKEN = "tok_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abc";

@Controller("health")
class HealthStubController {
  @Get()
  check() {
    return { status: "ok" };
  }
}

@Controller("stores/:storeId/orders")
class OrdersStubController {
  @Get()
  list() {
    return [];
  }
}

@Controller("public/orders")
class PublicOrdersStubController {
  @Get(":token")
  find() {
    throw new NotFoundException();
  }
}

// Boots real Nest (Express 5 adapter, `LoggerModule` middleware, `useLogger`)
// and reads back the raw lines, so what ships to stdout and GlitchTip is
// asserted, not just the config object.
describe("structured request logging", () => {
  let app: INestApplication;
  let raw: string;
  let bootLines: Record<string, unknown>[];

  beforeEach(async () => {
    raw = "";
    const sink = new Writable({
      write(chunk, _encoding, done) {
        raw += String(chunk);
        done();
      },
    });
    const moduleRef = await Test.createTestingModule({
      imports: [LoggerModule.forRoot(buildLoggerParams(sink))],
      controllers: [
        HealthStubController,
        OrdersStubController,
        PublicOrdersStubController,
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.useLogger(app.get(Logger));
    await app.init();
    // Nest's boot logs ("Mapped route ...") come through pino as well, which
    // is itself proof `useLogger` is wired; start each test from an empty sink.
    bootLines = lines();
    raw = "";
  });

  afterEach(async () => {
    await app.close();
  });

  const lines = () =>
    raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as Record<string, unknown>);

  it("tags Nest's framework boot lines with a context", () => {
    const contexts = new Set(bootLines.map((line) => line.context));
    expect(contexts).toContain("RoutesResolver");
  });

  it("logs one flat line per request, with the store and a request id", async () => {
    const response = await request(app.getHttpServer())
      .get("/stores/store-123/orders?email=a@b.com")
      .set("cookie", "session=SECRETCOOKIE")
      .set("x-request-id", "client-request-0001");

    expect(response.headers["x-request-id"]).toBe("client-request-0001");
    expect(lines()).toHaveLength(1);
    expect(lines()[0]).toMatchObject({
      level: 30,
      service: "api",
      method: "GET",
      path: "/stores/store-123/orders",
      statusCode: 200,
      storeId: "store-123",
      requestId: "client-request-0001",
      msg: "request completed",
    });
    expect(raw).not.toMatch(/SECRETCOOKIE|a@b\.com|cookie/);
    // Each key once: a duplicated key would mean a stale value (such as a
    // pre-response status code) is also on the line.
    expect(raw.match(/"statusCode"/g)).toHaveLength(1);
    expect(raw.match(/"path"/g)).toHaveLength(1);
  });

  it("does not log health probes", async () => {
    await request(app.getHttpServer()).get("/health").expect(200);
    expect(raw).toBe("");
  });

  it("scrubs the order token and logs a 404 at warn", async () => {
    await request(app.getHttpServer())
      .get(`/public/orders/${TOKEN}?x=1`)
      .expect(404);

    expect(lines()[0]).toMatchObject({
      level: 40,
      path: "/public/orders/:token",
      statusCode: 404,
    });
    expect(raw).not.toContain(TOKEN);
  });

  it("routes Nest's own Logger calls through the same JSON pipeline", async () => {
    const { Logger: NestLogger } = await import("@nestjs/common");
    new NestLogger("Probe").warn("hello from a service");

    expect(lines().at(-1)).toMatchObject({
      level: 40,
      msg: "hello from a service",
    });
  });
});
