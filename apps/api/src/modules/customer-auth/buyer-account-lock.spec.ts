import { ConflictException } from "@nestjs/common";
import type { BuyerAccount } from "@biasmarket/db";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../../prisma/prisma.service.js";
import { lockBuyerPhones, withBuyerAccountLock } from "./buyer-account-lock.js";

function account(phone: string | null, pendingPhone: string | null) {
  return {
    id: "buyer-1",
    phone,
    pendingPhone,
    email: "buyer@example.com",
    googleSub: null,
    passwordHash: null,
  } as BuyerAccount;
}

function makeTransaction(currentAccount: () => BuyerAccount) {
  const lockCalls: string[] = [];
  const tx = {
    $executeRaw: vi.fn(
      async (strings: TemplateStringsArray, ...values: unknown[]) => {
        lockCalls.push(String(values[0]));
        return 1;
      },
    ),
    $queryRaw: vi.fn(async () => [{ id: "buyer-1" }]),
    buyerAccount: {
      findUnique: vi.fn(async () => currentAccount()),
    },
  };
  return { tx, lockCalls };
}

describe("buyer account lock protocol", () => {
  it("takes normalized phone locks in sorted order before entering the action", async () => {
    const current = account("+51911111111", "+51922222222");
    const { tx, lockCalls } = makeTransaction(() => current);
    const prisma = {
      buyerAccount: { findUnique: vi.fn(async () => current) },
      $transaction: vi.fn(
        async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
      ),
    } as unknown as PrismaService;

    const result = await withBuyerAccountLock(prisma, current.id, async () => {
      expect(lockCalls).toHaveLength(2);
      return "locked";
    });

    expect(result).toBe("locked");
    expect(lockCalls).toEqual([...lockCalls].sort());
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it("rebuilds the phone lock set when an account hint changed before its row lock", async () => {
    let stored = account("+51911111111", null);
    let transactionNumber = 0;
    const lockCalls: string[][] = [];
    const prisma = {
      buyerAccount: { findUnique: vi.fn(async () => stored) },
      $transaction: vi.fn(
        async (action: (client: unknown) => Promise<unknown>) => {
          transactionNumber++;
          const tx = {
            $executeRaw: vi.fn(
              async (_strings: TemplateStringsArray, ...values: unknown[]) => {
                lockCalls[transactionNumber - 1] ??= [];
                lockCalls[transactionNumber - 1]!.push(String(values[0]));
                return 1;
              },
            ),
            $queryRaw: vi.fn(async () => {
              stored = account("+51922222222", null);
              return [{ id: "buyer-1" }];
            }),
            buyerAccount: { findUnique: vi.fn(async () => stored) },
          };
          return action(tx);
        },
      ),
    } as unknown as PrismaService;

    const result = await withBuyerAccountLock(
      prisma,
      "buyer-1",
      async (_tx, locked) => locked.phone,
    );

    expect(result).toBe("+51922222222");
    expect(transactionNumber).toBe(2);
    expect(lockCalls).toHaveLength(2);
    expect(lockCalls[0]).not.toEqual(lockCalls[1]);
  });

  it("returns a retryable conflict after bounded snapshot churn", async () => {
    const hint = account("+51911111111", null);
    let current = hint;
    const tx = {
      $executeRaw: vi.fn(async () => 1),
      $queryRaw: vi.fn(async () => {
        current = account("+51922222222", null);
        return [{ id: "buyer-1" }];
      }),
      buyerAccount: { findUnique: vi.fn(async () => current) },
    };
    const prisma = {
      buyerAccount: { findUnique: vi.fn(async () => hint) },
      $transaction: vi.fn(
        async (action: (client: typeof tx) => Promise<unknown>) => action(tx),
      ),
    } as unknown as PrismaService;

    await expect(
      withBuyerAccountLock(prisma, hint.id, async () => true),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(3);
  });

  it("deduplicates phone keys before acquiring them", async () => {
    const tx = { $executeRaw: vi.fn(async () => 1) };
    await lockBuyerPhones(tx as never, ["+51911111111", "+51911111111", null]);
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
  });
});
