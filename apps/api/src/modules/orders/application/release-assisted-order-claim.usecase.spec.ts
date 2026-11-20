import { ConflictException, NotFoundException } from "@nestjs/common";
import { type Mock, vi } from "vitest";
import { ReleaseAssistedOrderClaimUseCase } from "./release-assisted-order-claim.usecase.js";
import { PrismaService } from "../../../prisma/prisma.service.js";
import { OrderEventsService } from "./order-events.service.js";
import { CustomerAccountService } from "./customer-account.service.js";
import { verifyClaimTicket } from "../../customer-auth/claim-ticket.js";

describe("ReleaseAssistedOrderClaimUseCase", () => {
  let useCase: ReleaseAssistedOrderClaimUseCase;
  let prisma: {
    $transaction: Mock;
    $queryRaw: Mock;
    order: { findFirst: Mock; updateMany: Mock };
    auditLog: { create: Mock };
  };
  let events: { record: Mock };
  let customerAccount: { sendClaimReleasedEmail: Mock };
  const store = { id: "store-1", name: "Shop", slug: "shop" } as never;

  beforeEach(() => {
    process.env.CUSTOMER_ACCOUNT_TOKEN_SECRET = "test-secret";
    prisma = {
      $transaction: vi.fn((fn: (tx: unknown) => unknown) => fn(prisma)),
      $queryRaw: vi.fn().mockResolvedValue([{ id: "order-1" }]),
      order: {
        findFirst: vi.fn().mockResolvedValue({
          id: "order-1",
          source: "VENDOR_ASSISTED",
          claimedAt: new Date(),
          buyerAccountId: "buyer-1",
          accessTokenHash: "a".repeat(64),
          accessTokenRevokedAt: null,
          buyerAccount: {
            email: "buyer@example.com",
            emailVerified: true,
            googleSub: "google-1",
          },
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: { create: vi.fn() },
    };
    events = { record: vi.fn() };
    customerAccount = { sendClaimReleasedEmail: vi.fn() };
    useCase = new ReleaseAssistedOrderClaimUseCase(
      prisma as unknown as PrismaService,
      events as unknown as OrderEventsService,
      customerAccount as unknown as CustomerAccountService,
    );
  });

  it("releases only the store's assisted order, writes seller records and emails a bound ticket", async () => {
    await useCase.execute(store, "seller-1", "order-1");

    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.order.findFirst).toHaveBeenCalledWith({
      where: { id: "order-1", storeId: "store-1" },
      select: expect.objectContaining({ buyerAccount: expect.any(Object) }),
    });
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        id: "order-1",
        storeId: "store-1",
        buyerAccountId: "buyer-1",
      }),
      data: expect.objectContaining({
        claimedAt: null,
        buyerAccountId: null,
        claimReleaseId: expect.any(String),
        claimReleaseExpiresAt: expect.any(Date),
      }),
    });
    expect(events.record).toHaveBeenCalledWith(
      prisma,
      expect.objectContaining({
        type: "CLAIM_RELEASED",
        actor: "SELLER",
      }),
    );
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "order.claim_released",
        actorId: "seller-1",
      }),
    });
    expect(customerAccount.sendClaimReleasedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "buyer@example.com",
        ticket: expect.any(String),
      }),
    );
    const update = prisma.order.updateMany.mock.calls[0]![0];
    const email = customerAccount.sendClaimReleasedEmail.mock.calls[0]![0];
    expect(verifyClaimTicket(email.ticket)?.exp).toBe(
      update.data.claimReleaseExpiresAt.getTime(),
    );
  });

  it("does not release another store's order", async () => {
    prisma.$queryRaw.mockResolvedValue([]);
    await expect(
      useCase.execute(store, "seller-1", "other-order"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
    expect(customerAccount.sendClaimReleasedEmail).not.toHaveBeenCalled();
  });

  it("rejects an order with no active claim", async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: "order-1",
      source: "VENDOR_ASSISTED",
      claimedAt: null,
      buyerAccountId: null,
      buyerAccount: null,
    });
    await expect(
      useCase.execute(store, "seller-1", "order-1"),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it("sends a release notice but no reclaim capability to an unverified account", async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: "order-1",
      source: "VENDOR_ASSISTED",
      claimedAt: new Date(),
      buyerAccountId: "buyer-1",
      accessTokenHash: "a".repeat(64),
      accessTokenRevokedAt: null,
      buyerAccount: {
        email: "buyer@example.com",
        emailVerified: false,
        googleSub: "google-1",
      },
    });
    await useCase.execute(store, "seller-1", "order-1");
    expect(prisma.order.updateMany).toHaveBeenCalled();
    expect(customerAccount.sendClaimReleasedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "buyer@example.com",
        ticket: null,
      }),
    );
  });

  it("does not send a release notice when the former account has no email", async () => {
    prisma.order.findFirst.mockResolvedValue({
      id: "order-1",
      source: "VENDOR_ASSISTED",
      claimedAt: new Date(),
      buyerAccountId: "buyer-1",
      buyerAccount: { email: null, emailVerified: false, googleSub: null },
    });
    await useCase.execute(store, "seller-1", "order-1");
    expect(customerAccount.sendClaimReleasedEmail).not.toHaveBeenCalled();
  });
});
