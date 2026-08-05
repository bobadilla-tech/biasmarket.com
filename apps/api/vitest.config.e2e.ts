import swc from "unplugin-swc";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["**/*.e2e-spec.ts"],
    globals: true,
    root: "./",
    // Every e2e spec signs up/signs in its own user in `beforeAll` against
    // the real AppModule + better-auth. Running spec files in parallel (the
    // default) fires all of them within better-auth's rate-limit window (3
    // sign-in/sign-up requests per 10s, see auth.config.ts) and later specs
    // 403 — not a flake, a real shared-limiter collision once there are
    // more than a couple of specs. Sequential file execution avoids it.
    fileParallelism: false,
  },
  plugins: [
    swc.vite({
      module: { type: "es6" },
    }),
  ],
});
