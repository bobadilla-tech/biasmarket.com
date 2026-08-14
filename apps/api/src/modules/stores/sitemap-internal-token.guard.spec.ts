import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { beforeEach, describe, expect, it } from "vitest";
import {
  SitemapInternalTokenGuard,
  SITEMAP_INTERNAL_TOKEN_HEADER,
} from "./sitemap-internal-token.guard.js";

const SECRET = "correct-sitemap-secret";

function context(value: string | undefined): ExecutionContext {
  const request = { headers: { [SITEMAP_INTERNAL_TOKEN_HEADER]: value } };
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe("SitemapInternalTokenGuard", () => {
  beforeEach(() => {
    process.env.SITEMAP_INTERNAL_TOKEN = SECRET;
  });

  it("allows the configured token", () => {
    expect(new SitemapInternalTokenGuard().canActivate(context(SECRET))).toBe(true);
  });

  it.each([undefined, "wrong", "x".repeat(SECRET.length)])(
    "rejects an invalid token",
    (token) => {
      expect(() => new SitemapInternalTokenGuard().canActivate(context(token))).toThrow(
        UnauthorizedException,
      );
    },
  );
});
