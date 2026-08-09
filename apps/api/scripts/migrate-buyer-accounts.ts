#!/usr/bin/env node

// One-time backfill for docs/plans/2026-08-08-global-buyer-account-plan.md:
// collapses existing per-store `Customer` rows into global `BuyerAccount`
// rows, one per normalized phone number, with a `CustomerStoreLink` per
// original `Customer` row and every linkable `Order.customerId` repointed to
// the resolved `buyerAccountId` (added alongside `customerId`, not replacing
// it — see the plan's "Migration" section).
//
// SAFE BY DEFAULT: runs as a dry run (no writes) unless invoked with
// --apply. Per this repo's standing rule (mirrors the phone-normalization
// backfill), do not run this with --apply against a real/production
// database without explicit user sign-off.
//
// Usage:
//   pnpm --filter api migrate:buyer-accounts            # dry run
//   pnpm --filter api migrate:buyer-accounts -- --apply # writes

import { type Customer, PrismaClient } from "@biasmarket/db";
import { PrismaPg } from "@prisma/adapter-pg";
import { normalizePhone } from "@biasmarket/utils/phone-country";

const apply = process.argv.includes("--apply");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

interface GroupResult {
  phone: string;
  status: "merged" | "already-migrated" | "skipped-collision";
  customerCount: number;
  buyerAccountId?: string;
  supersededCustomerIds?: string[];
  reason?: string;
}

// The account most recently created wins for passwordHash/email — "the
// account the buyer used most recently wins." Never compares raw hashes
// (see the plan doc for why: salted hashes of the same password are almost
// never byte-identical, so hash-inequality is not a valid "different
// person" signal).
function pickWinner(customers: Customer[]): Customer {
  return [...customers].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  )[0];
}

// Real-identity ambiguity: two rows for the same phone both have a non-null
// email and the emails differ. A single row with no email, or two rows with
// the same email, are not ambiguous.
function hasEmailCollision(customers: Customer[]): boolean {
  const emails = new Set(
    customers.map((c) => c.email).filter((e): e is string => Boolean(e)),
  );
  return emails.size > 1;
}

async function migrateGroup(
  phone: string,
  customers: Customer[],
): Promise<GroupResult> {
  const existingBuyerAccount = await prisma.buyerAccount.findUnique({
    where: { phone },
  });
  if (existingBuyerAccount) {
    return {
      phone,
      status: "already-migrated",
      customerCount: customers.length,
      buyerAccountId: existingBuyerAccount.id,
    };
  }

  if (hasEmailCollision(customers)) {
    return {
      phone,
      status: "skipped-collision",
      customerCount: customers.length,
      reason: "Multiple distinct non-null emails on file for this phone — " +
        "left unmigrated for manual review. Customer ids: " +
        customers.map((c) => c.id).join(", "),
    };
  }

  const winner = pickWinner(customers);
  const superseded = customers.filter((c) => c.id !== winner.id);

  if (!apply) {
    return {
      phone,
      status: "merged",
      customerCount: customers.length,
      supersededCustomerIds: superseded.map((c) => c.id),
    };
  }

  const buyerAccount = await prisma.$transaction(async (tx) => {
    const created = await tx.buyerAccount.create({
      data: {
        phone,
        passwordHash: winner.passwordHash,
        email: winner.email,
        emailVerified: winner.emailVerified,
        pendingEmail: winner.pendingEmail,
        pendingPhone: winner.pendingPhone,
        name: winner.name,
      },
    });

    for (const customer of customers) {
      await tx.customerStoreLink.upsert({
        where: {
          buyerAccountId_storeId: {
            buyerAccountId: created.id,
            storeId: customer.storeId,
          },
        },
        create: { buyerAccountId: created.id, storeId: customer.storeId },
        update: {},
      });
      await tx.order.updateMany({
        where: { customerId: customer.id },
        data: { buyerAccountId: created.id },
      });
    }

    return created;
  });

  return {
    phone,
    status: "merged",
    customerCount: customers.length,
    buyerAccountId: buyerAccount.id,
    supersededCustomerIds: superseded.map((c) => c.id),
  };
}

async function main() {
  console.log(
    apply
      ? "Running with --apply: this WILL write to the database."
      : "Dry run (no --apply): no writes will be made.",
  );

  const customers = await prisma.customer.findMany();
  const groups = new Map<string, Customer[]>();
  for (const customer of customers) {
    const phone = normalizePhone(customer.phone);
    const group = groups.get(phone) ?? [];
    group.push(customer);
    groups.set(phone, group);
  }

  console.log(
    `Found ${customers.length} Customer rows across ${groups.size} distinct phone numbers.`,
  );

  const results: GroupResult[] = [];
  for (const [phone, group] of groups) {
    results.push(await migrateGroup(phone, group));
  }

  const merged = results.filter((r) => r.status === "merged");
  const alreadyMigrated = results.filter((r) =>
    r.status === "already-migrated"
  );
  const skipped = results.filter((r) => r.status === "skipped-collision");

  console.log(
    `\n${merged.length} group(s) ${apply ? "merged" : "would be merged"}.`,
  );
  for (const r of merged) {
    if (r.supersededCustomerIds && r.supersededCustomerIds.length > 0) {
      console.log(
        `  ${r.phone}: ${r.customerCount} Customer row(s) -> BuyerAccount ${
          r.buyerAccountId ?? "(dry run)"
        }; superseded credentials from: ${r.supersededCustomerIds.join(", ")}`,
      );
    }
  }

  if (alreadyMigrated.length > 0) {
    console.log(
      `\n${alreadyMigrated.length} group(s) already migrated, skipped.`,
    );
  }

  if (skipped.length > 0) {
    console.log(
      `\n${skipped.length} group(s) SKIPPED for manual review (email collision):`,
    );
    for (const r of skipped) {
      console.log(`  ${r.phone}: ${r.reason}`);
    }
  }

  await prisma.$disconnect();
}

await main();
