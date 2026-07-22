import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site-config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/*/login",
        "/*/onboarding",
        "/*/onboarding/*",
        "/*/dashboard",
        "/*/dashboard/*",
        "/*/store/*/cart",
        "/*/store/*/checkout",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
