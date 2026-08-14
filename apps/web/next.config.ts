import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";
import path from "node:path";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: path.join(__dirname, "../.."),
  // Plain Sentry SDKs (server instrumentation) must stay external so their
  // Node builtins aren't re-bundled by Next — traced into the standalone
  // output instead.
  serverExternalPackages: ["@sentry/node", "@sentry/react"],
  images: {
    remotePatterns: [
      { protocol: "http", hostname: "localhost", port: "9000" },
      { protocol: "https", hostname: "cdn.biasmarket.com" },
      { protocol: "https", hostname: "placehold.co" },
      { protocol: "https", hostname: "cdn.sanity.io" },
    ],
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  typescript: {
    // TypeScript 7 ships no compiler API, so Next's build-time type-check
    // (which requires it) is disabled here; `pnpm typecheck` (tsc --noEmit)
    // is the source of truth instead.
    ignoreBuildErrors: true,
  },
};

export default withNextIntl(nextConfig);
