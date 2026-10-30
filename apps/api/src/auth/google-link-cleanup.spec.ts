import { type Mock, vi } from "vitest";
import { discardUnverifiedCredentials } from "./google-link-cleanup.js";

function buildPrisma(user: { emailVerified: boolean } | null) {
  return {
    user: { findUnique: vi.fn().mockResolvedValue(user) },
    account: { deleteMany: vi.fn() },
    session: { deleteMany: vi.fn() },
  } as unknown as Parameters<typeof discardUnverifiedCredentials>[0] & {
    account: { deleteMany: Mock };
    session: { deleteMany: Mock };
  };
}

describe("discardUnverifiedCredentials", () => {
  it("drops the password and sessions of an unverified user when Google is linked", async () => {
    const prisma = buildPrisma({ emailVerified: false });

    await discardUnverifiedCredentials(prisma, {
      providerId: "google",
      userId: "user-1",
    });

    expect(prisma.account.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1", providerId: "credential" },
    });
    expect(prisma.session.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-1" },
    });
  });

  it("keeps everything for a user whose email was already verified", async () => {
    const prisma = buildPrisma({ emailVerified: true });

    await discardUnverifiedCredentials(prisma, {
      providerId: "google",
      userId: "user-1",
    });

    expect(prisma.account.deleteMany).not.toHaveBeenCalled();
    expect(prisma.session.deleteMany).not.toHaveBeenCalled();
  });

  it("ignores other providers, such as the credential account created at signup", async () => {
    const prisma = buildPrisma({ emailVerified: false });

    await discardUnverifiedCredentials(prisma, {
      providerId: "credential",
      userId: "user-1",
    });

    expect(prisma.account.deleteMany).not.toHaveBeenCalled();
  });

  it("does nothing when the user no longer exists", async () => {
    const prisma = buildPrisma(null);

    await discardUnverifiedCredentials(prisma, {
      providerId: "google",
      userId: "ghost",
    });

    expect(prisma.account.deleteMany).not.toHaveBeenCalled();
  });
});
