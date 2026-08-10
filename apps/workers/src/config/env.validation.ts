// Boot-time assertion of every env var this app depends on at runtime —
// mirrors apps/api's env.validation.ts posture (fail fast with a clear
// message, don't 500/stall on the first job that needs it).
export function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export function validateEnv(): void {
  requiredEnv("REDIS_URL");

  // Needed to reach apps/api's internal expire-sweep endpoint — see the
  // migration plan's "three layers of defense" note. Both required
  // unconditionally: unlike RESEND_*, there's no "file driver"-style local
  // mode for this call.
  requiredEnv("INTERNAL_API_URL");
  requiredEnv("INTERNAL_JOBS_SECRET");

  // RESEND_* are only needed by the "resend" driver — MAIL_DRIVER=file (or
  // unset) is the documented local dev mode and must boot without
  // third-party credentials, same rule apps/api's env.validation.ts used to
  // enforce before the mailer moved here.
  const mailDriver = process.env.MAIL_DRIVER ?? "file";
  if (mailDriver === "resend") {
    requiredEnv("RESEND_API_KEY");
    requiredEnv("RESEND_FROM_EMAIL");
  } else if (mailDriver !== "file") {
    throw new Error(
      `Invalid MAIL_DRIVER: "${mailDriver}". Expected "file" or "resend".`,
    );
  }
}
