import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { PrismaService } from '../prisma/prisma.service.js';

export const createAuth = (prisma: PrismaService) =>
  betterAuth({
    url: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    emailAndPassword: { enabled: true },
    user: {
      additionalFields: {
        role: {
          type: 'string',
          defaultValue: 'seller',
          input: false, // server-controlled only — see scripts/promote-admin.ts
        },
      },
    },
    trustedOrigins: [process.env.WEB_URL ?? 'http://localhost:3001'],
  });
