import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // `.test.ts` only: jest component tests (`.test.tsx`, PR #236) run in a
    // different runner.
    include: ["src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // The UI is untested (about 10% of src), so measuring all of src would
      // make the floor meaningless. Only the logic files that have tests are
      // gated; the floor means "no regression". Revisit when component tests
      // land.
      include: [
        "src/features/auth/session-storage.ts",
        "src/features/cart/cart-storage.ts",
        "src/features/catalog/pagination.ts",
      ],
      thresholds: { statements: 79, branches: 81, functions: 72, lines: 87 },
    },
  },
});
