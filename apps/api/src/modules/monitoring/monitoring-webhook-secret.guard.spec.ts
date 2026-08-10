import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import { MonitoringWebhookSecretGuard } from "./monitoring-webhook-secret.guard.js";

const REAL_SECRET = "correct-secret-value";

function buildContext(headerValue: string | undefined): ExecutionContext {
  const req = { headers: { "x-webhook-secret": headerValue } };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

describe("MonitoringWebhookSecretGuard", () => {
  let guard: MonitoringWebhookSecretGuard;

  beforeEach(() => {
    process.env.MONITORING_WEBHOOK_SECRET = REAL_SECRET;
    guard = new MonitoringWebhookSecretGuard();
  });

  it("allows a request carrying the correct secret", () => {
    expect(guard.canActivate(buildContext(REAL_SECRET))).toBe(true);
  });

  it("rejects a missing secret header", () => {
    expect(() => guard.canActivate(buildContext(undefined))).toThrow(
      UnauthorizedException,
    );
  });

  it("rejects a wrong secret of a different length", () => {
    expect(() => guard.canActivate(buildContext("nope"))).toThrow(
      UnauthorizedException,
    );
  });

  it("rejects a wrong secret of the same length (exercises timingSafeEqual, not just the length check)", () => {
    const sameLengthWrongSecret = "x".repeat(REAL_SECRET.length);
    expect(() => guard.canActivate(buildContext(sameLengthWrongSecret)))
      .toThrow(UnauthorizedException);
  });
});
