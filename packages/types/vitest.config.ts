import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["http.ts", "index.ts"],
      exclude: ["**/*.test.*", "**/*.d.ts", "generated/**", "orval.config.ts"],
      // 35 statements (~3 points each): only a lines floor is stable.
      thresholds: { lines: 79 },
    },
  },
});
