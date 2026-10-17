import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.ts"],
      exclude: ["**/*.test.*", "**/*.spec.*", "**/*.d.ts"],
      thresholds: { statements: 88, branches: 74, functions: 92, lines: 89 },
    },
  },
});
