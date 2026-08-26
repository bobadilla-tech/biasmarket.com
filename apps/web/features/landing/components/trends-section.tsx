"use client";

import { CircleArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ProductSearchResultResponseDto } from "@biasmarket/types";
import { useLatestProducts } from "@/features/discovery";
import { Link } from "@/i18n/navigation";
import { ProductGridCard } from "./product-grid-card";
import { SectionHeading } from "./section-heading";

const SKELETON_KEYS = Array.from(
  { length: 3 },
  (_, index) => `trend-skeleton-${index}`,
);

const ROW_SKELETON_KEYS = Array.from(
  { length: 4 },
  (_, index) => `trend-row-skeleton-${index}`,
);

function useTrendProducts({
  sort,
  initialData,
}: {
  sort: "latest" | "bestseller";
  initialData?: ProductSearchResultResponseDto | null;
}) {
  const t = useTranslations("landing.trends");
  const { result, loading, error } = useLatestProducts(3, 1, {
    sort,
    initialData,
  });
  const products = result?.products ?? [];

  return {
    products,
    loading,
    message: loading
      ? null
      : error
        ? t("error")
        : products.length === 0
          ? t("empty")
          : null,
  };
}

function TrendPanel({
  title,
  sort,
  initialData,
}: {
  title: string;
  sort: "latest" | "bestseller";
  initialData?: ProductSearchResultResponseDto | null;
}) {
  const { products, loading, message } = useTrendProducts({
    sort,
    initialData,
  });

  return (
    <div className="flex flex-col rounded-[20px] bg-landing-rose px-4 py-5 sm:px-6">
      <h3 className="text-center text-lg font-semibold sm:text-2xl">{title}</h3>
      <div className="mt-4 grid grid-cols-3 gap-2.5 sm:mt-5 sm:gap-5">
        {loading ? (
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
        ) : message ? (
          <p className="col-span-3 rounded-[20px] bg-white px-6 py-10 text-center text-sm text-muted-foreground">
            {message}
          </p>
        ) : (
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
function TrendBand({
  title,
  sort,
  bandClassName,
  initialData,
}: {
  title: string;
  sort: "latest" | "bestseller";
  bandClassName: string;
  initialData?: ProductSearchResultResponseDto | null;
}) {
  const t = useTranslations("landing.trends");
  const { products, loading, message } = useTrendProducts({
    sort,
    initialData,
  });
  const viewMoreHref =
    sort === "bestseller" ? "/search?sort=bestseller" : "/search";

  return (
    <section className={`${bandClassName} px-5 py-2.5`}>
      <div className="flex items-center justify-between gap-4 py-1.5">
        <h2 className="text-[21px] leading-[26px] font-bold text-black">
          {title}
        </h2>
        <Link
          href={viewMoreHref}
          className="flex shrink-0 items-center gap-1.5 text-[13px] leading-4 font-medium text-[#FC17A0]"
        >
          {t("viewMore")}
          <CircleArrowRight className="size-4" strokeWidth={1.8} />
        </Link>
      </div>
      {loading ? (
        <div className="mt-2 flex gap-2.5 overflow-hidden">
          {ROW_SKELETON_KEYS.map((key) => (
            <div
              key={key}
              className="w-[174px] shrink-0 animate-pulse rounded-[10px] bg-white/70 p-[9.5px]"
            >
              <div className="aspect-square w-full rounded-[10px] bg-muted" />
              <div className="mt-2 h-3 w-4/5 rounded bg-muted" />
              <div className="mt-1.5 h-3 w-1/2 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : message ? (
        <p className="rounded-[10px] bg-white px-4 py-6 text-center text-sm text-muted-foreground">
          {message}
        </p>
      ) : (
        <div className="no-scrollbar -mx-5 mt-1 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-5 pb-1">
          {products.map((product) => (
            <div key={product.id} className="snap-start">
              <ProductGridCard product={product} variant="row" />
            </div>
          ))}
        </div>
      )}
    </section>
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
    <>
      <div className="sm:hidden">
        <TrendBand
          title={t("latestTitle")}
          sort="latest"
          bandClassName="bg-[#FFEAF6]"
          initialData={latestInitialData}
        />
        <TrendBand
          title={t("bestSellersTitle")}
          sort="bestseller"
          bandClassName="bg-[#F5EAFF]"
          initialData={bestSellersInitialData}
        />
      </div>

      <section className="mx-auto hidden max-w-7xl px-4 py-10 sm:block sm:px-10 lg:py-14">
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
    </>
  );
}
