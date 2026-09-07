#!/usr/bin/env node

// One-off measurement for D5 (see
// docs/plans/2026-09-07-store-rich-content-and-thin-content-indexing-plan.md
// Part 7 step 2): how many currently-public (isPublic && !isDemo) stores FAIL
// the `isStoreIndexable` bar. Run this once against prod to sanity-check the
// threshold before D6 flips the gate on. NOT a scheduled job.
//
// Usage: pnpm --filter api exec node scripts/measure-sub-bar-stores.ts

import { PrismaClient } from '@biasmarket/db';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  MIN_INDEXABLE_PRODUCTS,
  isStoreIndexable,
} from '../src/common/store-indexability.js';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

function textBlockBody(content: unknown): string {
  if (content !== null && typeof content === 'object' && 'body' in content) {
    const { body } = content as { body: unknown };
    if (typeof body === 'string') return body.trim();
  }
  return '';
}

const stores = await prisma.store.findMany({
  where: { isPublic: true, isDemo: false },
  select: {
    slug: true,
    isPublic: true,
    isDemo: true,
    publishedProductCount: true,
    bio: true,
    aboutMarkdown: true,
    owner: { select: { banned: true } },
    sections: {
      where: { type: 'TEXT_BLOCK', hidden: false },
      select: { content: true },
    },
  },
});

let pass = 0;
const failBelowProductBar: string[] = [];
const failNoProse: string[] = [];
const failOwnerBanned: string[] = [];

for (const s of stores) {
  const hasRealTextBlockSection = s.sections.some(
    (section) => textBlockBody(section.content) !== '',
  );
  const ownerBanned = s.owner?.banned === true;
  const indexable = isStoreIndexable({
    isPublic: s.isPublic,
    isDemo: s.isDemo,
    ownerBanned,
    publishedProductCount: s.publishedProductCount,
    bio: s.bio,
    aboutMarkdown: s.aboutMarkdown,
    hasRealTextBlockSection,
  });

  if (indexable) {
    pass += 1;
    continue;
  }
  if (ownerBanned) failOwnerBanned.push(s.slug);
  if (s.publishedProductCount < MIN_INDEXABLE_PRODUCTS)
    failBelowProductBar.push(s.slug);
  if (!s.bio?.trim() && !s.aboutMarkdown?.trim() && !hasRealTextBlockSection)
    failNoProse.push(s.slug);
}

const total = stores.length;
const fail = total - pass;

console.log(`Public non-demo stores:            ${total}`);
console.log(`  pass isStoreIndexable:           ${pass}`);
console.log(
  `  FAIL (sub-bar):                  ${fail}` +
    (total > 0 ? `  (${((fail / total) * 100).toFixed(1)}%)` : ''),
);
console.log(
  `    - below ${MIN_INDEXABLE_PRODUCTS}-product bar:          ${failBelowProductBar.length}`,
);
console.log(`    - no prose (bio/about/TEXT_BLOCK): ${failNoProse.length}`);
console.log(`    - owner banned:                  ${failOwnerBanned.length}`);
console.log(
  '\n(a store can fail on more than one axis, so the sub-counts overlap)',
);
if (fail > 0) {
  console.log('\nsub-bar slugs:');
  for (const slug of new Set([
    ...failBelowProductBar,
    ...failNoProse,
    ...failOwnerBanned,
  ]))
    console.log(`  ${slug}`);
}

await prisma.$disconnect();
