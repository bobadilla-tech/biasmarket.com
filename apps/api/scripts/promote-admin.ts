#!/usr/bin/env node

// Grants the platform-admin role to an EXISTING user by email — use this
// when the person already has an account (signed up normally) and just
// needs to be promoted. To create a brand-new admin account from scratch,
// use create-admin.ts instead. Role can't be self-assigned at signup
// either way (see apps/api/src/auth/auth.config.ts).
// Usage: pnpm --filter api run admin:promote <email>

import { PrismaClient } from '@biasmarket/db';
import { PrismaPg } from '@prisma/adapter-pg';

const email = process.argv[2];

if (!email) {
  console.error('Usage: node scripts/promote-admin.ts <email>');
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: process.env['DATABASE_URL'] });
const prisma = new PrismaClient({ adapter });

const user = await prisma.user.findUnique({ where: { email } });

if (!user) {
  console.error(`No user found with email ${email}`);
  await prisma.$disconnect();
  process.exit(1);
}

await prisma.user.update({ where: { email }, data: { role: 'admin' } });
console.log(`${email} is now an admin.`);

await prisma.$disconnect();
