import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import { type Mock, vi } from "vitest";
import { hashPassword } from "better-auth/crypto";
import { createCustomerSessionToken } from "@biasmarket/utils/customer-account-token";
import {
  CustomerSessionGuard,
  type CustomerSessionRequest,
} from "./customer-session.guard.js";
import type { PrismaService } from "../../prisma/prisma.service.js";
import { CUSTOMER_SESSION_COOKIE } from "./customer-session.constants.js";

function buildContext(cookieHeader: string | undefined) {
  const req = {
    headers: { cookie: cookieHeader },
  } as unknown as CustomerSessionRequest;
  const cookieMock = vi.fn();
  const res = { cookie: cookieMock };
  const context = {
    switchToHttp: () => ({
      getRequest: () => req,
      getResponse: () => res,
    }),
  } as unknown as ExecutionContext;
  return { req, res, cookieMock, context };
}

describe("CustomerSessionGuard", () => {
  let prisma: { buyerAccount: { findUnique: Mock } };
  let guard: CustomerSessionGuard;

  beforeEach(() => {
    process.env.CUSTOMER_ACCOUNT_TOKEN_SECRET = "test-secret";
    prisma = { buyerAccount: { findUnique: vi.fn() } };
    guard = new CustomerSessionGuard(prisma as unknown as PrismaService);
  });

  it("rejects when there is no session cookie", async () => {
    const { context } = buildContext(undefined);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects a tampered or expired token", async () => {
    const { context } = buildContext(
      `${CUSTOMER_SESSION_COOKIE}=not-a-real-token`,
    );

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("rejects a token whose password version no longer matches (password changed since issuance)", async () => {
    const oldHash = await hashPassword("old-password-1");
    const token = createCustomerSessionToken("buyer-1", 1, "test-secret");
    const newHash = await hashPassword("new-password-1");
    prisma.buyerAccount.findUnique.mockResolvedValue({
      id: "buyer-1",
      passwordHash: newHash,
      passwordVersion: 2,
    });

    const { context } = buildContext(`${CUSTOMER_SESSION_COOKIE}=${token}`);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("accepts a valid token, attaches the session, and reissues a fresh cookie", async () => {
    const passwordHash = await hashPassword("current-password-1");
    const token = createCustomerSessionToken("buyer-1", 1, "test-secret");
    prisma.buyerAccount.findUnique.mockResolvedValue({
      id: "buyer-1",
      passwordHash,
      passwordVersion: 1,
    });

    const { req, res, cookieMock, context } = buildContext(
      `${CUSTOMER_SESSION_COOKIE}=${token}`,
    );

    const result = await guard.canActivate(context);

    expect(result).toBe(true);
    expect(req.customerSession).toEqual({ buyerAccountId: "buyer-1" });
    expect(cookieMock).toHaveBeenCalledWith(
      CUSTOMER_SESSION_COOKIE,
      expect.any(String),
      expect.objectContaining({ httpOnly: true, path: "/" }),
    );
    void res;
  });

  it("rejects when the account has no password set (deleted/never-registered)", async () => {
    const token = createCustomerSessionToken("buyer-1", 0, "test-secret");
    prisma.buyerAccount.findUnique.mockResolvedValue({
      id: "buyer-1",
      passwordHash: null,
      passwordVersion: 0,
    });

    const { context } = buildContext(`${CUSTOMER_SESSION_COOKIE}=${token}`);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
