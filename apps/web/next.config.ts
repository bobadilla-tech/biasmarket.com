import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  typescript: {
    // TypeScript 7 ships no compiler API, so Next's build-time type-check
    // (which requires it) is disabled here; `pnpm typecheck` (tsc --noEmit)
    // is the source of truth instead.
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
