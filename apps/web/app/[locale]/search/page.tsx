import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { ProductSearchPageClient } from "./search-page-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({
    locale,
    namespace: "storefront.productSearch",
  });
  return {
    title: t("title"),
    robots: { index: false, follow: true },
  };
}

function parsePositiveInt(value: string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export default async function ProductSearchPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    category?: string;
    sort?: string;
    page?: string;
  }>;
}) {
  const { q, category, sort, page } = await searchParams;
  return (
    <ProductSearchPageClient
      initialQuery={q ?? ""}
      initialCategory={category}
      initialSort={sort === "bestseller" ? "bestseller" : "latest"}
      initialPage={parsePositiveInt(page) ?? 1}
    />
  );
}
