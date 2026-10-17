import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["**/*.test.*", "**/*.spec.*", "**/*.d.ts"],
      thresholds: { statements: 95, branches: 90, functions: 97, lines: 95 },
    },
  },
});
