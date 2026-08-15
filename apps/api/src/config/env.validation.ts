import { Logger } from '@nestjs/common';

// Single app-wide copy of the `requiredEnv` helper that previously existed —
// five times over, with inconsistent eagerness — in storage.service.ts,
// mailer.core.ts, customer-auth.service.ts, customer-session.guard.ts, and
// customer-account.service.ts. Those files import this one instead.
export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// Every env var the app requires at boot regardless of driver/runtime config.
const REQUIRED_ENV_VARS = [
  'DATABASE_URL',
  'BETTER_AUTH_SECRET',
  'BETTER_AUTH_URL',
  'WEB_URL',
  // Previously validated only lazily at request time in three files — a
  // missing value passed boot and health checks and only 500ed on the first
  // buyer-auth request (login, session verification, order-flow customer
  // account). Promoted to boot-time here; the per-file calls remain as
  // backstops and now use this shared helper.
  'CUSTOMER_ACCOUNT_TOKEN_SECRET',
  // Required at boot so a missing REDIS_URL fails loudly here instead of on
  // the first enqueue call. Redis being unreachable (vs. REDIS_URL being
  // unset) is a different failure mode — BullMQ's Queue client connects
  // lazily and retries in the background, so the app still boots and serves
  // unrelated requests; only the individual queue.add() call fails, which
  // callers must not let fail the parent request (see apps/api/src/queue).
  'REDIS_URL',
  'S3_BUCKET',
  'S3_LOGO_BUCKET',
  'S3_PAYMENT_BUCKET',
  'S3_PUBLIC_URL',
  'S3_ENDPOINT',
  'S3_ACCESS_KEY',
  'S3_SECRET_KEY',
  // Verifies apps/workers can call back into the expire-sweep endpoint.
  // MAIL_DRIVER/RESEND_* moved to apps/workers' own env.validation.ts along
  // with the mailer itself (see the migration plan) — apps/api no longer
  // touches Resend at all.
  'INTERNAL_JOBS_SECRET',
  // Gates POST /monitoring/webhook (see MonitoringWebhookSecretGuard) —
  // Uptime Kuma's shared secret for the durable-incident-history path.
  'MONITORING_WEBHOOK_SECRET',
  'SITEMAP_INTERNAL_TOKEN',
];

// Boot-time assertion of every env var the app actually depends on at
// runtime. Called from main.ts before NestFactory.create — the earliest
// point the process can refuse to start — so a bad deploy fails with a
// clear message naming the missing var instead of silently falling back or
// 500ing on the first request that needs it.
export function validateEnv(): void {
  for (const name of REQUIRED_ENV_VARS) {
    requiredEnv(name);
  }

  // NODE_ENV unset in a non-local deployment silently disables the cookie
  // `secure` flag and defaults Swagger to ON (see main.ts). Warn, don't
  // fail: Node treats an unset NODE_ENV as a valid (if non-production) state.
  if (
    process.env.NODE_ENV === undefined &&
    !process.env.WEB_URL?.includes('localhost')
  ) {
    new Logger('EnvValidation').warn(
      'NODE_ENV is not set in what looks like a production deployment — ' +
        'buyer-auth cookies will not be marked Secure and Swagger defaults to ON.',
    );
  }
}
