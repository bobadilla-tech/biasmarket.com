import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "jsdom",
    // Playwright specs under e2e/ are `*.spec.ts` too — keep vitest out of
    // them (they need a browser + a running server, not jsdom).
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", "e2e/**"],
    // lib/api-client.ts calls configureApiClient() eagerly at module load,
    // throwing if NEXT_PUBLIC_API_URL/INTERNAL_API_URL is unset — fine for
    // real dev/build (.env.local always sets it) but a real test file can
    // reach it transitively through an unrelated feature's barrel export
    // without ever importing @/lib/api-client directly, so per-test-file
    // vi.mock("@/lib/api-client", ...) doesn't cover it (e.g.
    // customer.schema.test.ts -> @/features/orders barrel ->
    // use-enabled-payment-methods.ts -> store-settings' settingsApi ->
    // @/lib/api-client, first hit migrating store-settings in Batch 3).
    // Matches the real .env.local value so tests see the same env shape
    // dev/build already do.
    env: { NEXT_PUBLIC_API_URL: "http://localhost:3000" },
    setupFiles: ["./vitest.setup.ts"],
    server: {
      deps: {
        inline: ["next-intl"],
      },
    },
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
    },
  },
});
