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
        "/*/login",
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
