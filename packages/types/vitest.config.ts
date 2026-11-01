import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["**/node_modules/**", "**/dist/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["http.ts"],
      exclude: ["**/*.test.*", "**/*.d.ts", "generated/**", "orval.config.ts"],
      // 35 statements (~3 points each): only a lines floor is stable.
      thresholds: { lines: 79 },
    },
  },
});
