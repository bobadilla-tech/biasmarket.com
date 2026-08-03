import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { AppModule } from "./../src/app.module.js";

// Exercises the two throttle rules the buyer-accounts follow-ups doc flagged
// as untested: the buyer-side Nest `ThrottlerGuard` (5 req/min, see
// CustomerAuthController) and better-auth's own native rate limiter (3
// req/10s, forced on in every env via `rateLimit.enabled: true` in
// auth.config.ts — a Nest guard can never see those requests, since
// better-auth mounts as raw Express middleware ahead of Nest's router).
describe("rate limiting (e2e)", () => {
  let app: INestApplication;
  const origin = process.env.WEB_URL ?? "http://localhost:3001";

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it("throttles buyer login after 5 requests/min", async () => {
    const server = app.getHttpServer();
    const attempt = () =>
      request(server)
        .post("/stores/rate-limit-test-store/account/login")
        .set("Origin", origin)
        .send({ phone: "+51900000000", password: "wrong-password" });

    const responses: number[] = [];
    for (let i = 0; i < 6; i++) {
      const res = await attempt();
      responses.push(res.status);
    }

    // The first 5 reach the handler (404 — the store doesn't exist — not
    // 401, since the store lookup happens before the credential check).
    // Only the 6th is stopped by the throttle itself.
    expect(responses.slice(0, 5)).not.toContain(429);
    expect(responses[5]).toBe(429);
  });

  it("throttles better-auth sign-in after 3 requests/10s", async () => {
    const server = app.getHttpServer();
    const attempt = () =>
      request(server)
        .post("/api/auth/sign-in/email")
        .set("Origin", origin)
        .send({ email: "nobody@example.com", password: "wrong-password" });

    const responses: number[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await attempt();
      responses.push(res.status);
    }

    expect(responses[3]).toBe(429);
  });
});
