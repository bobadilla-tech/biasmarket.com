import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import path from "path";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

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

export default withNextIntl(nextConfig);
