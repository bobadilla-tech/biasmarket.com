"use client";

import { CircleArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ProductSearchResultResponseDto } from "@biasmarket/types";
import { useLatestProducts } from "@/features/discovery";
import { Link } from "@/i18n/navigation";
import { ProductGridCard } from "./product-grid-card";

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
  const { result, loading, error } = useLatestProducts(6, 1, {
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
    <section className={`landing-trend-band ${bandClassName} rounded-[24px] border border-white/80 px-4 py-4 shadow-[var(--shadow-pop)] sm:rounded-[30px] sm:px-6 sm:py-5`}>
      <div className="flex items-center justify-between gap-4 py-1.5">
        <h2 className="text-[21px] leading-[26px] font-bold text-landing-ink">
          {title}
        </h2>
        <Link
          href={viewMoreHref}
          className="flex shrink-0 items-center gap-1.5 text-[13px] leading-4 font-medium text-landing-title transition-colors hover:text-landing-link"
        >
          {t("viewMore")}
          <CircleArrowRight className="size-4" strokeWidth={1.8} />
        </Link>
      </div>
      {loading ? (
        <div className="no-scrollbar mt-2 flex flex-nowrap gap-2.5 overflow-x-auto">
          {ROW_SKELETON_KEYS.map((key) => (
            <div
              key={key}
              className="fan-skeleton w-[150px] shrink-0 rounded-lg bg-white/70 p-[9.5px]"
            >
              <div className="aspect-square w-full rounded-lg bg-muted" />
              <div className="mt-2 h-3 w-4/5 rounded bg-muted" />
              <div className="mt-1.5 h-3 w-1/2 rounded bg-muted" />
            </div>
          ))}
        </div>
      ) : message ? (
        <p className="mt-2 rounded-lg bg-white px-4 py-6 text-center text-sm text-muted-foreground">
          {message}
        </p>
      ) : (
        <div className="no-scrollbar mt-2 flex flex-nowrap gap-2.5 overflow-x-auto">
          {products.map((product) => (
            <div key={product.id} className="shrink-0">
              <ProductGridCard product={product} variant="row" />
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function TrendBandStripe({
  title,
  sort,
  bg,
  initialData,
}: {
  title: string;
  sort: "latest" | "bestseller";
  bg: string;
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
    <section className={`landing-trend-strip mx-auto w-full max-w-[1344px] rounded-[28px] border border-white/80 px-4 py-8 shadow-[var(--shadow-pop)] sm:px-8 sm:py-10 ${bg}`}>
      <div className="mx-auto max-w-[1240px] px-1 sm:px-3">
        <div className="flex items-center justify-between gap-8">
          <h2 className="text-[32px] leading-[39px] font-bold text-landing-ink">
            {title}
          </h2>
          <Link
            href={viewMoreHref}
            className="flex items-center gap-3 text-[20px] leading-6 font-medium text-landing-title transition-colors hover:text-landing-link"
          >
            {t("viewMore")}
            <CircleArrowRight className="size-7" strokeWidth={1.6} />
          </Link>
        </div>

        {loading ? (
          <div className="mt-7 grid grid-cols-6 gap-[12.3px]">
            {Array.from({ length: 6 }, (_, index) => (
              <div
                key={`stripe-skeleton-${index}`}
                className="fan-skeleton rounded-lg bg-white/70 p-[11.6px]"
              >
                <div className="aspect-square w-full rounded-[12.3px] bg-muted" />
                <div className="mt-2 h-3 w-4/5 rounded bg-muted" />
                <div className="mt-1.5 h-3 w-1/2 rounded bg-muted" />
              </div>
            ))}
          </div>
        ) : message ? (
          <p className="mt-7 rounded-lg bg-white px-4 py-8 text-center text-sm text-muted-foreground">
            {message}
          </p>
        ) : (
          <div className="mt-7 grid grid-cols-6 gap-[12.3px]">
            {products.slice(0, 6).map((product) => (
              <ProductGridCard
                key={product.id}
                product={product}
                variant="row"
                className="!w-full !rounded-lg !border-transparent"
              />
            ))}
          </div>
        )}
      </div>
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
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-3 px-4 sm:hidden">
        <TrendBand
          title={t("latestTitle")}
          sort="latest"
          bandClassName="bg-landing-pink"
          initialData={latestInitialData}
        />
        <TrendBand
          title={t("bestSellersTitle")}
          sort="bestseller"
          bandClassName="bg-landing-violet"
          initialData={bestSellersInitialData}
        />
      </div>

      <div className="hidden flex-col gap-5 px-4 sm:flex sm:px-8 lg:px-10">
        <TrendBandStripe
          title={t("latestTitle")}
          sort="latest"
          bg="bg-landing-pink"
          initialData={latestInitialData}
        />
        <TrendBandStripe
          title={t("bestSellersTitle")}
          sort="bestseller"
          bg="bg-landing-violet"
          initialData={bestSellersInitialData}
        />
      </div>
    </>
  );
}
