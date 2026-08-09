import { Logger } from "@nestjs/common";

// Single app-wide copy of the `requiredEnv` helper that previously existed —
// five times over, with inconsistent eagerness — in storage.service.ts,
// mailer.core.ts, customer-auth.service.ts, customer-session.guard.ts, and
// customer-account.service.ts. Those files import this one instead.
export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// Boot-time assertion of every env var the app actually depends on at
// runtime. Called from main.ts before NestFactory.create — the earliest
// point the process can refuse to start — so a bad deploy fails with a
// clear message naming the missing var instead of silently falling back or
// 500ing on the first request that needs it.
export function validateEnv(): void {
  requiredEnv("DATABASE_URL");
  requiredEnv("BETTER_AUTH_SECRET");
  requiredEnv("BETTER_AUTH_URL");
  requiredEnv("WEB_URL");
  // Previously validated only lazily at request time in three files — a
  // missing value passed boot and health checks and only 500ed on the first
  // buyer-auth request (login, session verification, order-flow customer
  // account). Promoted to boot-time here; the per-file calls remain as
  // backstops and now use this shared helper.
  requiredEnv("CUSTOMER_ACCOUNT_TOKEN_SECRET");

  requiredEnv("S3_BUCKET");
  requiredEnv("S3_LOGO_BUCKET");
  requiredEnv("S3_PAYMENT_BUCKET");
  requiredEnv("S3_PUBLIC_URL");
  requiredEnv("S3_ENDPOINT");
  requiredEnv("S3_ACCESS_KEY");
  requiredEnv("S3_SECRET_KEY");

  // RESEND_* are only needed by the "resend" driver. MAIL_DRIVER=file (or
  // unset, which resolveDriver() treats as "file") is the documented local
  // dev mode and must not require third-party credentials at boot — the
  // mailer previously required both unconditionally even in file mode (see
  // mailer.core.ts), a latent bug this pass fixes alongside the
  // consolidation.
  const mailDriver = process.env.MAIL_DRIVER ?? "file";
  if (mailDriver === "resend") {
    requiredEnv("RESEND_API_KEY");
    requiredEnv("RESEND_FROM_EMAIL");
  } else if (mailDriver !== "file") {
    throw new Error(
      `Invalid MAIL_DRIVER: "${mailDriver}". Expected "file" or "resend".`,
    );
  }

  // NODE_ENV unset in a non-local deployment silently disables the cookie
  // `secure` flag and defaults Swagger to ON (see main.ts). Warn, don't
  // fail: Node treats an unset NODE_ENV as a valid (if non-production) state.
  if (
    process.env.NODE_ENV === undefined &&
    !process.env.WEB_URL?.includes("localhost")
  ) {
    new Logger("EnvValidation").warn(
      "NODE_ENV is not set in what looks like a production deployment — " +
        "buyer-auth cookies will not be marked Secure and Swagger defaults to ON.",
    );
  }
}
