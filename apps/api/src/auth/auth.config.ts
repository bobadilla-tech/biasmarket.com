import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins/admin';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import type { Auth } from '@thallesp/nestjs-better-auth';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailerService } from '../mailer/mailer.service.js';

function buildVerificationEmailHtml(url: string): string {
  return `
    <p>Hola,</p>
    <p>Confirma tu cuenta de Bias Market haciendo clic en el siguiente enlace:</p>
    <p><a href="${url}">${url}</a></p>
    <p>Si no creaste esta cuenta, ignora este correo.</p>
    <hr />
    <p>Hi,</p>
    <p>Confirm your Bias Market account by clicking the link below:</p>
    <p><a href="${url}">${url}</a></p>
    <p>If you didn't create this account, ignore this email.</p>
  `;
}

// Explicit `Auth` return type (an intentional `any` alias from
// @thallesp/nestjs-better-auth) sidesteps TS2742 — with plugins configured,
// betterAuth()'s inferred return type references an unexported zod path
// that TS can't print portably across this file boundary.
export const createAuth = (prisma: PrismaService, mailer: MailerService): Auth =>
  betterAuth({
    url: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    emailAndPassword: {
      enabled: true,
      // sendOnSignUp implicitly follows this (better-auth: `sendOnSignUp ??
      // requireEmailVerification`) — no need to also set it below.
      requireEmailVerification: true,
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await mailer.send({
          to: user.email,
          subject: 'Verifica tu cuenta — Bias Market / Verify your account',
          html: buildVerificationEmailHtml(url),
        });
      },
    },
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
