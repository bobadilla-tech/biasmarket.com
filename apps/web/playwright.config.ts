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
 * Caps (audit Phase 0): ≤6 routes × ≤3 viewports (375 / 768 / desktop).
 * `workers: 1` — better-auth rate-limits sign-ins and specs share one seller
 * `storageState`.
 */

const baseURL = process.env.WEB_E2E_BASE_URL ?? "http://localhost:3001";

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
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
      },
    },
    {
      name: "tablet-768",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 768, height: 1024 },
      },
    },
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
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
