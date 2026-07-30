#!/usr/bin/env node

// One-off backfill: PaymentMethodConfig previously existed in the schema but
// was never actually written to by any code path, so every pre-existing
// store has zero rows. The Settings page used to hardcode all 4 methods as
// always-shown regardless — now that it reads real config, every store
// without rows would suddenly show "no payment methods" until a seller
// manually configures them. This creates all 4 methods as enabled for every
// store that has none yet, preserving today's "everything shown" behavior.
// Idempotent: skips stores that already have at least one row.

import { createSeedClient } from './seed/client.ts';

const prisma = createSeedClient();

const PAYMENT_METHODS = ['YAPE', 'PLIN', 'TRANSFER', 'CASH'] as const;

const stores = await prisma.store.findMany({ select: { id: true } });

let backfilled = 0;

for (const store of stores) {
  const existing = await prisma.paymentMethodConfig.count({ where: { storeId: store.id } });
  if (existing > 0) continue;

  await prisma.paymentMethodConfig.createMany({
    data: PAYMENT_METHODS.map((method) => ({
      storeId: store.id,
      method,
      enabled: true,
      details: {},
    })),
  });
  backfilled += 1;
}

console.log(`Backfilled payment methods for ${backfilled} store(s).`);
await prisma.$disconnect();
