import { ConflictException } from "@nestjs/common";
import type { BuyerAccount, Prisma } from "@biasmarket/db";
import { normalizePhone } from "@biasmarket/utils/phone-country";
import { PrismaService } from "../../prisma/prisma.service.js";

const MAX_BUYER_ACCOUNT_LOCK_ATTEMPTS = 3;

type BuyerAccountClient = Prisma.TransactionClient;
type BuyerPhoneSnapshot = Pick<BuyerAccount, "phone" | "pendingPhone">;

class BuyerPhoneSnapshotChanged extends Error {}

/** Serialize every identity writer for the same normalized phone. */
export async function lockBuyerPhone(
  tx: BuyerAccountClient,
  phone: string,
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`buyer-phone:${normalizePhone(phone)}`}))`;
}

/** Lock an existing identity row after all known phone locks have been taken. */
export async function lockBuyerAccountRow(
  tx: BuyerAccountClient,
  buyerAccountId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "BuyerAccount" WHERE "id" = ${buyerAccountId} FOR UPDATE
  `;
  return rows.length === 1;
}

export async function lockBuyerOrderRow(
  tx: BuyerAccountClient,
  orderId: string,
): Promise<boolean> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE
  `;
  return rows.length === 1;
}

export async function lockBuyerOrders(
  tx: BuyerAccountClient,
  buyerAccountId: string,
): Promise<string[]> {
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Order"
    WHERE "buyerAccountId" = ${buyerAccountId}
    ORDER BY "id" ASC
    FOR UPDATE
  `;
  return rows.map(({ id }) => id);
}

export async function lockBuyerAddresses(
  tx: BuyerAccountClient,
  buyerAccountId: string,
): Promise<void> {
  await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "Address"
    WHERE "buyerAccountId" = ${buyerAccountId}
    ORDER BY "id" ASC
    FOR UPDATE
  `;
}

export async function lockBuyerStoreLinks(
  tx: BuyerAccountClient,
  buyerAccountId: string,
): Promise<void> {
  await tx.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "CustomerStoreLink"
    WHERE "buyerAccountId" = ${buyerAccountId}
    ORDER BY "storeId" ASC, "id" ASC
    FOR UPDATE
  `;
}

/**
 * Enter an account-ID-only write in the global order: hinted phone(s), account
 * row, then caller-owned order/child locks. The phone values are hints until
 * the row is locked. If they changed, the transaction is rolled back and the
 * complete lock set is rebuilt from a fresh snapshot.
 */
export async function withBuyerAccountLock<T>(
  prisma: PrismaService,
  buyerAccountId: string,
  action: (tx: BuyerAccountClient, account: BuyerAccount) => Promise<T>,
  additionalPhones: Array<string | null | undefined> = [],
): Promise<T | null> {
  for (let attempt = 0; attempt < MAX_BUYER_ACCOUNT_LOCK_ATTEMPTS; attempt++) {
    const hint = await prisma.buyerAccount.findUnique({
      where: { id: buyerAccountId },
      select: { phone: true, pendingPhone: true },
    });
    if (!hint) return null;

    try {
      return await prisma.$transaction(async (tx) => {
        await lockBuyerPhones(tx, [
          hint.phone,
          hint.pendingPhone,
          ...additionalPhones,
        ]);
        if (!(await lockBuyerAccountRow(tx, buyerAccountId))) return null;

        const account = await tx.buyerAccount.findUnique({
          where: { id: buyerAccountId },
        });
        if (!account) return null;
        if (
          account.phone !== hint.phone ||
          account.pendingPhone !== hint.pendingPhone
        ) {
          throw new BuyerPhoneSnapshotChanged();
        }
        return action(tx, account);
      });
    } catch (error) {
      if (error instanceof BuyerPhoneSnapshotChanged) continue;
      throw error;
    }
  }

  throw new ConflictException("La cuenta está cambiando; vuelve a intentarlo");
}

export async function lockBuyerPhones(
  tx: BuyerAccountClient,
  phones: Array<string | null | undefined>,
): Promise<void> {
  const normalized = [
    ...new Set(
      phones
        .filter((phone): phone is string => Boolean(phone))
        .map(normalizePhone),
    ),
  ].sort();
  for (const phone of normalized) await lockBuyerPhone(tx, phone);
}

export function hasLiveBuyerIdentity(
  account: Pick<BuyerAccount, "phone" | "email" | "googleSub" | "passwordHash">,
): boolean {
  return Boolean(
    account.phone || account.email || account.googleSub || account.passwordHash,
  );
}
