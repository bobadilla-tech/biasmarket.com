import { defineConfig, devices } from "@playwright/test";

/**
 * Scoped Playwright project for the a11y / responsive remediation (audit
 * Phase 0). jsdom cannot see contrast, focus-visibility, reflow, real
 * announcement, portal theming, or nested focus — those checks live here,
 * against a real `next start` build.
 *
 * Server orchestration is the CI job's responsibility (audit Phase 0 / R2-2):
 * `apps/api` on :3000 and `next build && next start` for web on :3001, plus
 * `seed:base`. Locally, point `WEB_E2E_BASE_URL` at an already-running stack,
 * or let the `webServer` block below start web (an API must still be up
 * separately). All routes are locale-prefixed (`/es/...`) — there is no
 * `middleware.ts`.
 *
 * Caps (audit Phase 0): ≤6 routes × ≤3 viewports (375 / 768 / desktop) for the
 * a11y projects. `workers: 1` — better-auth rate-limits sign-ins, the API
 * throttles per IP and every context shares 127.0.0.1.
 *
 * Journeys (#277) live in `e2e/flows/*.spec.ts`, run by the `flows` project at
 * 375×812 in Spanish after the `setup` project logs the seeded seller in once
 * (`e2e/.auth/seller.json`, gitignored). They never depend on the a11y
 * projects (each owns its state), and the a11y projects ignore `flows/`, so
 * `--project=mobile-375` alone keeps running exactly the original specs.
 */

const baseURL = process.env.WEB_E2E_BASE_URL ?? "http://localhost:3001";
const a11yIgnore = [/flows\//];

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }], ["list"]]
    : [["html", { open: "never" }], ["list"]],
  // A slow run should fail with a report instead of being cancelled by the
  // job timeout (scripts/ci/web-e2e.sh's job has 35 min; see docs/core/ci.md).
  globalTimeout: 20 * 60_000,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [
    {
      name: "mobile-375",
      testIgnore: a11yIgnore,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
      },
    },
    {
      name: "tablet-768",
      testIgnore: a11yIgnore,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "desktop",
      testIgnore: a11yIgnore,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
      retries: 1,
    },
    {
      name: "flows",
      dependencies: ["setup"],
      testMatch: /flows\/.*\.spec\.ts/,
      // Flows create non-idempotent data (orders, claims): never retry.
      retries: 0,
      timeout: 120_000,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        storageState: "e2e/.auth/seller.json",
        reducedMotion: "reduce",
        // Traces can hold cookies, private links and the seed password; they
        // are CI artifacts only because every datum here is disposable.
        trace: "retain-on-failure",
      },
    },
  ],
  // CI (scripts/ci/web-e2e.sh) sets WEB_E2E_BASE_URL and manages both servers
  // itself; only start web here for the local `pnpm test:e2e` convenience (an
  // API must still be running separately on :3000).
  webServer: process.env.WEB_E2E_BASE_URL
    ? undefined
    : {
        command: "pnpm run start -- -p 3001",
        url: baseURL,
        timeout: 120_000,
        reuseExistingServer: !process.env.CI,
      },
});
