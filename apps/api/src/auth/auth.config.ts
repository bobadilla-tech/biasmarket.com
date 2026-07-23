import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins/admin';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import type { Auth } from '@thallesp/nestjs-better-auth';
import { PrismaService } from '../prisma/prisma.service.js';

// Explicit `Auth` return type (an intentional `any` alias from
// @thallesp/nestjs-better-auth) sidesteps TS2742 — with plugins configured,
// betterAuth()'s inferred return type references an unexported zod path
// that TS can't print portably across this file boundary.
export const createAuth = (prisma: PrismaService): Auth =>
  betterAuth({
    url: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    emailAndPassword: { enabled: true },
    // Role is owned by the admin plugin (below), not a hand-rolled
    // additionalField — role stays server-controlled only, see
    // scripts/promote-admin.ts. defaultRole preserves the pre-plugin
    // default (the plugin's own default is "user").
    plugins: [
      admin({
        defaultRole: 'seller',
        adminRoles: ['admin'],
      }),
    ],
    trustedOrigins: [process.env.WEB_URL ?? 'http://localhost:3001'],
  });
