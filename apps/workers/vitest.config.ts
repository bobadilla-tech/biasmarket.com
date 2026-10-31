import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    root: "./",
    include: ["src/**/*.spec.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      // Count source files no test loads (without `include` v8 only reports
      // loaded files, which inflates the numbers).
      include: ["src/**/*.ts"],
      exclude: ["**/*.spec.ts", "**/*.d.ts"],
      thresholds: { statements: 59, branches: 32, functions: 63, lines: 60 },
    },
  },
  plugins: [
    // This is required to build the test files with SWC
    swc.vite({
      // Explicitly set the module type to avoid inheriting this value from
      // the project's .swcrc config file
      module: { type: "es6" },
    }),
  ],
});
