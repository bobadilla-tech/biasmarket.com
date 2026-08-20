import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { getHomeDiscoveryData } from "@/features/discovery/server";
import { LandingPage } from "@/features/landing";
import { canonicalUrl } from "@/lib/site-config";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "common.meta" });
  const title = t("title");
  const description = t("description");
  return {
    title,
    description,
    alternates: { canonical: canonicalUrl(locale, "") },
    openGraph: {
      title,
      description,
      siteName: "Bias Market",
      locale,
      type: "website",
      images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og-image.png"],
    },
  };
}

export default async function Home() {
  const { latestTrend, bestSellers, discoverProducts } =
    await getHomeDiscoveryData();

  return (
    <LandingPage
      latestProducts={latestTrend}
      bestSellers={bestSellers}
      discoverProducts={discoverProducts}
    />
  );
}
