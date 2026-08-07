#!/usr/bin/env node

// One-off backfill for the phone-normalization bug (see
// docs/plans/2026-08-06-buyer-phone-normalization-fix.md): any Customer row
// created before normalizePhone() landed may have `phone` stored in
// whatever shape the buyer typed it in at the time
// ("987654321"/"51987654321"/"+51987654321"/etc.), instead of the
// canonical "+<dialCode><nationalNumber>" shape the app now normalizes to
// on every read/write path.
//
// DOES NOT RUN AGAINST PROD BY ITSELF. Dry-run by default — prints what it
// would change and exits without writing anything. Pass --execute to
// actually write. This script must not be run against production customer
// data without explicit sign-off — see the plan doc.
//
// Collisions are NOT auto-mergeable: two Customer rows that normalize to
// the same phone within one store each carry their own Orders,
// passwordHash/session state, and pendingEmail/pendingPhone — silently
// merging them is a real-identity judgment call this script must not make.
// Colliding rows are skipped and logged for manual review; every
// non-colliding row is still backfilled (partial completion is the
// intended outcome, not all-or-nothing).
//
// Usage:
//   node scripts/backfill-normalize-customer-phones.ts              # dry run
//   node scripts/backfill-normalize-customer-phones.ts --execute    # writes

import { PrismaClient } from "@biasmarket/db";
import { PrismaPg } from "@prisma/adapter-pg";
import { normalizePhone } from "@biasmarket/utils/phone-country";

const execute = process.argv.includes("--execute");

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const customers = await prisma.customer.findMany({
  select: { id: true, storeId: true, phone: true },
});

const byStore = new Map<string, Set<string>>();
for (const customer of customers) {
  const phones = byStore.get(customer.storeId) ?? new Set();
  phones.add(customer.phone);
  byStore.set(customer.storeId, phones);
}

let alreadyNormalized = 0;
let toUpdate = 0;
let collided = 0;

for (const customer of customers) {
  const normalized = normalizePhone(customer.phone);

  if (normalized === customer.phone) {
    alreadyNormalized++;
    continue;
  }

  const storePhones = byStore.get(customer.storeId)!;
  const collidesWithExisting = customers.some((other) =>
    other.id !== customer.id &&
    other.storeId === customer.storeId &&
    normalizePhone(other.phone) === normalized
  );

  if (collidesWithExisting) {
    collided++;
    console.warn(
      `[COLLISION] customer ${customer.id} (store ${customer.storeId}): ` +
        `"${customer.phone}" -> "${normalized}" already used by another ` +
        `customer in this store — skipped, needs manual review.`,
    );
    continue;
  }

  toUpdate++;
  console.log(
    `[${execute ? "UPDATE" : "DRY-RUN"}] customer ${customer.id} (store ${customer.storeId}): ` +
      `"${customer.phone}" -> "${normalized}"`,
  );

  if (execute) {
    await prisma.customer.update({
      where: { id: customer.id },
      data: { phone: normalized },
    });
  }
  storePhones.add(normalized);
}

console.log(
  `\n${
    execute ? "Applied" : "Would apply"
  } ${toUpdate} update(s), ${collided} collision(s) skipped (need manual review), ` +
    `${alreadyNormalized} already normalized. Total customers: ${customers.length}.`,
);
if (!execute && toUpdate > 0) {
  console.log("\nDry run only — re-run with --execute to write changes.");
}

await prisma.$disconnect();
