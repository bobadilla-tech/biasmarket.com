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
}
