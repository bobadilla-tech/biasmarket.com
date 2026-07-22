#!/usr/bin/env node

// Grants the platform-admin role to an existing user by email.
// This is the only way to create an admin account — role can no longer be
// set by the client at signup (see apps/api/src/auth/auth.config.ts).
// Usage: pnpm --filter api exec node scripts/promote-admin.ts <email>

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
