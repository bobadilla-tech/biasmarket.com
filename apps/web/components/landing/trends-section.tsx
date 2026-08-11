"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useLatestProducts } from "@/features/discovery";
import { ProductGridCard } from "./product-grid-card";

function TrendPanel({
  title,
  onNavigate,
}: {
  title: string;
  onNavigate: () => void;
}) {
  const t = useTranslations("landing.trends");
  const { result, loading } = useLatestProducts(3);
  const products = result?.products ?? [];

  return (
    <div className="flex flex-col rounded-[20px] bg-landing-rose px-4 pt-5 pb-5 sm:px-8 sm:pt-6 sm:pb-7">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-medium sm:text-2xl">{title}</h3>
        <button
          type="button"
          onClick={onNavigate}
          className="shrink-0 text-sm font-medium text-landing-link hover:underline sm:text-base"
        >
          {t("viewAll")}
        </button>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2.5 sm:mt-5 sm:gap-5">
        {loading || products.length === 0
          ? Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="flex flex-col overflow-hidden rounded-[20px] bg-white"
            >
              <div className="aspect-[3/4] w-full animate-pulse bg-muted" />
              <div className="space-y-2 p-3">
                <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))
          : products.map((product) => (
            <ProductGridCard
              key={product.id}
              product={product}
              className="rounded-[20px] border-transparent"
            />
          ))}
      </div>
    </div>
  );
}

export function TrendsSection() {
  const t = useTranslations("landing.trends");
  const router = useRouter();

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-10 sm:py-14">
      <h2 className="text-center text-3xl font-medium sm:text-5xl">
        {t("title")}
      </h2>
      <div className="mt-6 grid gap-5 sm:mt-8 sm:gap-8 lg:grid-cols-2">
        <TrendPanel
          title={t("latestTitle")}
          onNavigate={() => router.push("/search")}
        />
        <TrendPanel
          title={t("bestSellersTitle")}
          onNavigate={() => router.push("/search")}
        />
      </div>
    </section>
  );
}
