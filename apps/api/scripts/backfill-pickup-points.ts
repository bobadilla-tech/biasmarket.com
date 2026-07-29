#!/usr/bin/env node

// One-off backfill: creates a PickupPoint row for every store whose legacy
// single-address PICKUP delivery config (DeliveryMethodConfig.details.address)
// held a non-empty string, before that field stops being read. Idempotent per
// store label — safe to rerun, but will duplicate a point if run twice with
// the same address already promoted to a PickupPoint (no natural key to
// dedupe against), so only run once per environment.

import { createSeedClient } from './seed/client.ts';

const prisma = createSeedClient();

const legacyPickupConfigs = await prisma.deliveryMethodConfig.findMany({
  where: { type: 'PICKUP' },
});

let created = 0;

for (const config of legacyPickupConfigs) {
  const address = (config.details as Record<string, unknown> | null)?.['address'];
  if (typeof address !== 'string' || address.trim() === '') continue;

  await prisma.pickupPoint.create({
    data: {
      storeId: config.storeId,
      label: address.trim(),
      enabled: config.enabled,
    },
  });
  created += 1;
}

console.log(`Backfilled ${created} pickup point(s) from legacy addresses.`);
await prisma.$disconnect();
