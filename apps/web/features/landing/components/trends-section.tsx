"use client";

import { useTranslations } from "next-intl";
import type { ProductSearchResultResponseDto } from "@biasmarket/types";
import { useLatestProducts } from "@/features/discovery";
import { ProductGridCard } from "./product-grid-card";
import { SectionHeading } from "./section-heading";

const SKELETON_KEYS = Array.from(
  { length: 3 },
  (_, index) => `trend-skeleton-${index}`,
);

function TrendPanel({
  title,
  sort,
  initialData,
}: {
  title: string;
  sort: "latest" | "bestseller";
  initialData?: ProductSearchResultResponseDto | null;
}) {
  const t = useTranslations("landing.trends");
  const { result, loading, error } = useLatestProducts(3, 1, {
    sort,
    initialData,
  });
  const products = result?.products ?? [];

  return (
    <div className="flex flex-col rounded-[20px] bg-landing-rose px-4 py-5 sm:px-6">
      <h3 className="text-center text-lg font-semibold sm:text-2xl">{title}</h3>
      <div className="mt-4 grid grid-cols-3 gap-2.5 sm:mt-5 sm:gap-5">
        {loading
          ? (
            SKELETON_KEYS.map((key) => (
              <div
                key={key}
                className="flex flex-col overflow-hidden rounded-[20px] bg-white"
              >
                <div className="aspect-[3/4] w-full animate-pulse bg-muted" />
                <div className="space-y-2 p-3">
                  <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
                </div>
              </div>
            ))
          )
          : error || products.length === 0
          ? (
            <p className="col-span-3 rounded-[20px] bg-white px-6 py-10 text-center text-sm text-muted-foreground">
              {error ? t("error") : t("empty")}
            </p>
          )
          : (
            products.map((product) => (
              <ProductGridCard
                key={product.id}
                product={product}
                className="rounded-[20px] border-transparent"
              />
            ))
          )}
      </div>
    </div>
  );
}

export function TrendsSection({
  latestInitialData = null,
  bestSellersInitialData = null,
}: {
  latestInitialData?: ProductSearchResultResponseDto | null;
  bestSellersInitialData?: ProductSearchResultResponseDto | null;
}) {
  const t = useTranslations("landing.trends");

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-10 sm:py-14">
      <SectionHeading title={t("title")} />
      <div className="mt-6 grid gap-5 sm:mt-8 sm:gap-8 lg:grid-cols-2">
        <TrendPanel
          title={t("latestTitle")}
          sort="latest"
          initialData={latestInitialData}
        />
        <TrendPanel
          title={t("bestSellersTitle")}
          sort="bestseller"
          initialData={bestSellersInitialData}
        />
      </div>
    </section>
  );
}
