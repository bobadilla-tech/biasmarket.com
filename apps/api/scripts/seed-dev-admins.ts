#!/usr/bin/env node

// Dev-only convenience: seeds a couple of admin accounts so the
// /admin/inquiries panel (and anything else gated by @Roles(['admin'])) is
// testable without hand-running promote-admin.ts after every fresh DB.
// Idempotent — safe to run on every container start (docker-compose.dev.yml
// runs this right after `prisma migrate deploy`).
// Never runs against prod: docker-compose.yml has no equivalent step.

import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@biasmarket/db';
import { PrismaPg } from '@prisma/adapter-pg';
import { hashPassword } from 'better-auth/crypto';

const DEV_ADMINS = [
  { email: 'admin@biasmarket.dev', name: 'Dev Admin' },
  { email: 'owner@biasmarket.dev', name: 'Dev Owner' },
];
const DEV_ADMIN_PASSWORD = 'devpassword123';

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] });
const prisma = new PrismaClient({ adapter });

for (const { email, name } of DEV_ADMINS) {
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    await prisma.user.update({ where: { email }, data: { role: 'admin' } });
    console.log(`${email} already existed — ensured role: admin`);
    continue;
  }

  const userId = randomUUID();
  const now = new Date();

  await prisma.user.create({
    data: {
      id: userId,
      name,
      email,
      emailVerified: true,
      role: 'admin',
      createdAt: now,
      updatedAt: now,
    },
  });

  await prisma.account.create({
    data: {
      id: randomUUID(),
      accountId: userId,
      providerId: 'credential',
      userId,
      password: await hashPassword(DEV_ADMIN_PASSWORD),
      createdAt: now,
      updatedAt: now,
    },
  });

  console.log(`Created admin ${email} (password: ${DEV_ADMIN_PASSWORD})`);
}

await prisma.$disconnect();
