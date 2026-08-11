"use client";

import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { useLatestProducts } from "@/features/discovery";
import { ProductGridCard } from "./product-grid-card";

export function DiscoverSection() {
  const t = useTranslations("landing.discover");
  const { result, loading } = useLatestProducts(12);
  const products = result?.products ?? [];

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-10 sm:py-14">
      <h2 className="text-center text-3xl font-medium sm:text-5xl">
        {t("title")}
      </h2>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
        {loading || products.length === 0
          ? Array.from({ length: 12 }).map((_, index) => (
            <div
              key={index}
              className="flex flex-col overflow-hidden rounded-[10px] border border-landing-graphite bg-white"
            >
              <div className="aspect-[3/4] w-full animate-pulse bg-muted" />
              <div className="space-y-2 p-3">
                <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
                <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))
          : products.map((product) => (
            <ProductGridCard key={product.id} product={product} />
          ))}
      </div>

      <div className="mt-8 flex justify-center sm:mt-10">
        <Link
          href="/search"
          className={buttonVariants({
            variant: "secondary",
            className: "h-14 w-full rounded-[10px] px-12 text-lg sm:h-[63px] sm:w-auto sm:text-xl",
          })}
        >
          {t("cta")}
        </Link>
      </div>
    </section>
  );
}
