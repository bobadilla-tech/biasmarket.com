import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import type { ProductSearchResultResponseDto } from "@biasmarket/types";
import { discoveryApi } from "@/features/discovery/api/discovery.api";
import { LandingPage } from "@/components/landing/landing-page";

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

async function fetchProducts(
  limit: number,
  sort: "latest" | "bestseller",
): Promise<ProductSearchResultResponseDto | null> {
  try {
    return await discoveryApi.searchProducts({ limit, sort });
  } catch {
    // The landing page must render even when the API is down — the sections
    // surface their own error/empty states client-side.
    return null;
  }
}

export default async function Home() {
  const [latestTrend, bestSellers, discoverProducts] = await Promise.all([
    fetchProducts(3, "latest"),
    fetchProducts(3, "bestseller"),
    fetchProducts(12, "latest"),
  ]);

  return (
    <LandingPage
      latestProducts={latestTrend}
      bestSellers={bestSellers}
      discoverProducts={discoverProducts}
    />
  );
}
