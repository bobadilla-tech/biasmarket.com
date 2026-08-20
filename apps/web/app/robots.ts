import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/en/account$",
        "/es/account$",
        // Anchored+literal, not "/*/login": Google's robots.txt "*" matches
        // any sequence including "/", so a wildcarded "/*/login" also
        // matches /store/[slug]/account/login (the storefront buyer login
        // page, which the 2026-08-14 plan explicitly kept indexable). Same
        // collision class already fixed once for /account above.
        "/en/login$",
        "/es/login$",
        "/*/onboarding",
        "/*/onboarding/*",
        "/*/dashboard",
        "/*/dashboard/*",
        "/*/admin",
        "/*/admin/*",
        "/*/store/*/cart",
        "/*/store/*/checkout",
        "/*/store/*/account/forgot-password",
        "/*/store/*/account/confirm",
        "/*/store/*/account/orders",
        "/*/store/*/account/orders/*",
        "/*/verify-email",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
