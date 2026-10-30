// Where the stack under test lives. scripts/ci/web-e2e.sh serves web and the
// API on the SAME host (127.0.0.1) so SameSite=Lax cookies are sent, and
// exports these; the defaults match it for a local run.
export const WEB_URL = process.env.WEB_E2E_BASE_URL ?? "http://127.0.0.1:3001";
export const API_URL = process.env.WEB_E2E_API_URL ?? "http://127.0.0.1:3000";

// Unique per CI run (web-e2e.sh); a local run gets one per process.
export const RUN_ID = process.env.E2E_RUN_ID ?? `local-${Date.now()}`;

export const SELLER_STATE = "e2e/.auth/seller.json";

// Seeded by `pnpm --filter api run seed:base` (apps/api/scripts/seed). Copied
// here on purpose: the web package never imports the api package. If the seed
// changes, auth.setup.ts fails loudly on login.
export const SEED_SELLER = {
  email: "seed-seller1@biasmarket.dev",
  password: "seedpassword123",
  otherStoreSlug: "demo-kpop-corner",
};
