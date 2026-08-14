#!/usr/bin/env node

// Seed command for both dev auto-boot and manual prod operator runs.
//
// Base mode (default, no flags): idempotent core fixtures — 2 admins plus
// demo sellers/stores covering storefront browsing, merchandising blocks
// (categories/collections/sections), checkout-relevant inventory edge cases
// (unlimited/low/sold-out stock, reserved units, price/image overrides,
// draft & expired products), and the order payment/fulfillment state
// combinations a seller sees in their dashboard. Safe to rerun any number of
// times — every fixture is upserted by natural key or a deterministic seed
// id (see ids.ts), never duplicated.
//
// Append mode (--append --batch=<label>): adds one more labeled demo store
// on top of the base fixtures without touching them. Rerunning with the same
// label repairs that batch in place; a new label adds a separate batch.
//
// Reachable in production by running the seed command inside the currently
// live `api-<color>` container; see docs/core/admin-access.md. The operation is
// idempotent, additive-only, and has no destructive mode.

import { createSeedClient } from './client.ts';
import { applyStoreFixture } from './apply.ts';
import { ensureContactInquiry, ensureUser } from './helpers.ts';
import { seedId } from './ids.ts';
import {
  buildAppendFixture,
  buildBaseFixtures,
  buildContactInquiries,
} from './fixtures.ts';

const args = process.argv.slice(2);
const append = args.includes('--append');
const batch = args
  .find((a) => a.startsWith('--batch='))
  ?.slice('--batch='.length);

if (append && !batch) {
  console.error('Usage: node scripts/seed/run.ts --append --batch=<label>');
  process.exit(1);
}

const prisma = createSeedClient();
const unverifiedCustomerLinks: { email: string; url: string }[] = [];

if (append) {
  const result = await applyStoreFixture(
    prisma,
    batch!,
    buildAppendFixture(batch!),
  );
  unverifiedCustomerLinks.push(...result.unverifiedCustomerLinks);
} else {
  const { admins, stores } = buildBaseFixtures();
  for (const admin of admins) {
    await ensureUser(prisma, {
      email: admin.email,
      name: admin.name,
      role: 'admin',
    });
  }
  for (const store of stores) {
    const result = await applyStoreFixture(prisma, 'base', store);
    unverifiedCustomerLinks.push(...result.unverifiedCustomerLinks);
  }
  for (const inquiry of buildContactInquiries()) {
    await ensureContactInquiry(prisma, {
      id: seedId('base', 'contact-inquiry', inquiry.key),
      name: inquiry.name,
      email: inquiry.email,
      company: inquiry.company,
      inquiryType: inquiry.inquiryType,
      message: inquiry.message,
    });
  }
}

if (unverifiedCustomerLinks.length > 0) {
  console.log(
    '\nUnverified seeded buyer accounts — confirm links (30-day tokens):',
  );
  for (const link of unverifiedCustomerLinks) {
    console.log(`  ${link.email} -> ${link.url}`);
  }
}

await prisma.$disconnect();
