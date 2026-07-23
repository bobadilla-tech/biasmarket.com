#!/usr/bin/env node

// Dev-only seed setup: creates a few admin accounts, a few sellers each with
// a store and some products, so the dev environment isn't empty on first
// boot — the admin panel, seller dashboard, and storefront all have
// something to look at without clicking through onboarding by hand.
// Idempotent — safe to run on every container start (docker-compose.dev.yml
// runs this right after `prisma migrate deploy`).
// Never runs against prod: docker-compose.yml has no equivalent step.

import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@biasmarket/db';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from 'better-auth/crypto';

const DEV_PASSWORD = 'devpassword123';

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] });
const prisma = new PrismaClient({ adapter });

async function ensureUser(email: string, name: string, role: 'admin' | 'seller') {
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    await prisma.user.update({ where: { email }, data: { role } });
    console.log(`${email} already existed — ensured role: ${role}`);
    return existing.id;
  }

  const userId = randomUUID();
  const now = new Date();

  await prisma.user.create({
    data: { id: userId, name, email, emailVerified: true, role, createdAt: now, updatedAt: now },
  });

  await prisma.account.create({
    data: {
      id: randomUUID(),
      accountId: userId,
      providerId: 'credential',
      userId,
      password: await hashPassword(DEV_PASSWORD),
      createdAt: now,
      updatedAt: now,
    },
  });

  console.log(`Created ${role} ${email} (password: ${DEV_PASSWORD})`);
  return userId;
}

async function ensureStore(
  ownerId: string,
  data: { name: string; slug: string; whatsappNumber: string },
) {
  const existing = await prisma.store.findUnique({ where: { slug: data.slug } });
  if (existing) {
    console.log(`Store ${data.slug} already existed`);
    return existing;
  }

  // Mirrors StoresService.create()'s real shape exactly, not just what the
  // schema allows — empty themeConfig/paymentInstructions, one PICKUP
  // delivery method, same as every store created through the app.
  const store = await prisma.store.create({
    data: {
      name: data.name,
      slug: data.slug,
      ownerId,
      themeConfig: {},
      paymentInstructions: '',
      whatsappNumber: data.whatsappNumber,
      defaultCurrency: 'PEN',
    },
  });

  await prisma.deliveryMethodConfig.create({
    data: { storeId: store.id, type: 'PICKUP', enabled: true, details: {} },
  });

  console.log(`Created store ${store.slug}`);
  return store;
}

async function ensureProducts(
  storeId: string,
  storeSlug: string,
  products: { name: string; description: string; price: string; variant?: { name: string; attributes: Record<string, string> } }[],
) {
  const existingCount = await prisma.product.count({ where: { storeId } });
  if (existingCount > 0) {
    console.log(`Store ${storeSlug} already has products`);
    return;
  }

  for (const p of products) {
    const product = await prisma.product.create({
      data: {
        storeId,
        name: p.name,
        description: p.description,
        price: p.price,
        status: 'PUBLISHED', // seed data should be visible, not sitting in DRAFT
      },
    });

    if (p.variant) {
      await prisma.productVariant.create({
        data: {
          productId: product.id,
          storeId,
          name: p.variant.name,
          attributes: p.variant.attributes,
        },
      });
    }
  }

  console.log(`Seeded ${products.length} products for ${storeSlug}`);
}

// --- Admins ---
await ensureUser('admin@biasmarket.dev', 'Dev Admin', 'admin');
await ensureUser('owner@biasmarket.dev', 'Dev Owner', 'admin');

// --- Sellers + stores + products ---
const seller1Id = await ensureUser('seller1@biasmarket.dev', 'Camila Seller', 'seller');
const store1 = await ensureStore(seller1Id, {
  name: 'Tienda de Camila',
  slug: 'tienda-de-camila',
  whatsappNumber: '+51987654321',
});
await ensureProducts(store1.id, store1.slug, [
  {
    name: 'Álbum Photobook Edition',
    description: 'Álbum oficial con photobook de 80 páginas.',
    price: '45.00',
    variant: { name: 'Versión A', attributes: { version: 'A' } },
  },
  {
    name: 'Photocard Set',
    description: 'Set de 5 photocards random.',
    price: '15.00',
  },
  {
    name: 'Lightstick Oficial',
    description: 'Lightstick con bluetooth, edición actual.',
    price: '60.00',
  },
]);

const seller2Id = await ensureUser('seller2@biasmarket.dev', 'K-Pop Corner', 'seller');
const store2 = await ensureStore(seller2Id, {
  name: 'K-Pop Corner',
  slug: 'kpop-corner',
  whatsappNumber: '+51912345678',
});
await ensureProducts(store2.id, store2.slug, [
  {
    name: 'Poster Oficial',
    description: 'Poster A2 enrollado, envío protegido.',
    price: '20.00',
  },
  {
    name: 'Photocard Member Set',
    description: 'Photocard random por miembro.',
    price: '12.00',
    variant: { name: 'Jungkook', attributes: { member: 'Jungkook' } },
  },
  {
    name: 'Merch Bundle',
    description: 'Bundle con llavero + sticker pack.',
    price: '25.00',
  },
]);

await prisma.$disconnect();
