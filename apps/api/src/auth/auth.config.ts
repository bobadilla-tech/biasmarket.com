import { betterAuth } from 'better-auth';
import { admin } from 'better-auth/plugins/admin';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { Logger } from '@nestjs/common';
import type { Auth } from '@thallesp/nestjs-better-auth';
import { escapeHtml } from '@biasmarket/utils/strings';
import { PrismaService } from '../prisma/prisma.service.js';
import type { MailerService } from '../mailer/mailer.service.js';

const logger = new Logger('auth');

// Matches the admin plugin's `defaultRole` below — kept in sync so a
// duplicate-signup synthetic user (see `customSyntheticUser`) carries the
// same `role` a genuine new signup would get.
const DEFAULT_SELLER_ROLE = 'seller';

function buildVerificationEmailHtml(url: string): string {
  const safeUrl = escapeHtml(url);
  return `
    <p>Hola,</p>
    <p>Confirma tu cuenta de Bias Market haciendo clic en el siguiente enlace:</p>
    <p><a href="${safeUrl}">${safeUrl}</a></p>
    <p>Si no creaste esta cuenta, ignora este correo.</p>
    <hr />
    <p>Hi,</p>
    <p>Confirm your Bias Market account by clicking the link below:</p>
    <p><a href="${safeUrl}">${safeUrl}</a></p>
    <p>If you didn't create this account, ignore this email.</p>
  `;
}

// Explicit `Auth` return type (an intentional `any` alias from
// @thallesp/nestjs-better-auth) sidesteps TS2742 — with plugins configured,
// betterAuth()'s inferred return type references an unexported zod path
// that TS can't print portably across this file boundary.
export const createAuth = (
  prisma: PrismaService,
  mailer: MailerService,
): Auth =>
  betterAuth({
    url: process.env.BETTER_AUTH_URL,
    secret: process.env.BETTER_AUTH_SECRET,
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    emailAndPassword: {
      enabled: true,
      // sendOnSignUp implicitly follows this (better-auth: `sendOnSignUp ??
      // requireEmailVerification`) — no need to also set it below.
      requireEmailVerification: true,
      // On a duplicate-email signup, better-auth returns a synthetic user
      // built from the output schema's defaultValues so the response is
      // indistinguishable from a real signup (anti-enumeration, see
      // db/schema.mjs's buildSyntheticUserOutput). The admin plugin's `role`
      // field has no schema-level defaultValue (the real 'seller' default is
      // applied by a DB hook at creation, not the schema), so without this
      // override a synthetic response would leak `role: null` where a real
      // signup has `role: 'seller'` — a field-level enumeration side channel
      // via the raw API. Mirrors better-auth's own documented example.
      customSyntheticUser: ({ coreFields, additionalFields, id }) => ({
        ...coreFields,
        role: DEFAULT_SELLER_ROLE,
        banned: false,
        banReason: null,
        banExpires: null,
        ...additionalFields,
        id,
      }),
    },
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        await mailer.send({
          to: user.email,
          subject: 'Verifica tu cuenta — Bias Market / Verify your account',
          html: buildVerificationEmailHtml(url),
        });
      },
      // Resends the verification email on a sign-in attempt with an
      // unverified account — same 403 EMAIL_NOT_VERIFIED response either
      // way, just gives someone whose original link expired/got lost a way
      // to get a new one without a dedicated "resend" endpoint.
      sendOnSignIn: true,
    },
    // Role is owned by the admin plugin (below), not a hand-rolled
    // additionalField — role stays server-controlled only, see
    // scripts/promote-admin.ts. defaultRole preserves the pre-plugin
    // default (the plugin's own default is "user").
    plugins: [
      admin({
        defaultRole: DEFAULT_SELLER_ROLE,
        adminRoles: ['admin'],
      }),
    ],
    trustedOrigins: [process.env.WEB_URL ?? 'http://localhost:3001'],
    // Better-auth mounts its handler via `httpAdapter.use()` inside its own
    // module's `onModuleInit` (raw Express middleware, before Nest's router
    // even runs) — so a Nest `@nestjs/throttler` guard can never reach
    // `/sign-in/email` and friends, no matter how it's registered. This is
    // better-auth's own native rate limiter instead, which runs inside its
    // request handling and is guaranteed to apply. It defaults to
    // `enabled: isProduction`; forced on here so it's active in every
    // environment, matching the buyer-login throttling added alongside it
    // (see modules/customer-auth). Its built-in default rule already covers
    // sign-in/sign-up/change-password/change-email paths at 3 requests per
    // 10s (see better-auth's `getDefaultSpecialRules`) — stricter than the
    // buyer-side 5/60s, so no `customRules` override is needed here.
    rateLimit: {
      enabled: true,
    },
    advanced: {
      // Without this, every better-auth call that sends an email (signup
      // verification, sign-in resend above) awaits it inline, blocking the
      // HTTP response on Resend. This is better-auth's own extension point
      // for backgrounding those sends — not a queue we built.
      backgroundTasks: {
        handler: (promise) => {
          promise.catch((err) => logger.error('Background task failed', err));
        },
      },
    },
  });
