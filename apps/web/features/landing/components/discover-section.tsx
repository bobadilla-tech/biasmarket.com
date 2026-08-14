"use client";

import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import type { ProductSearchResultResponseDto } from "@biasmarket/types";
import { useLatestProducts } from "@/features/discovery";
import { ProductGridCard } from "./product-grid-card";
import { SectionHeading } from "./section-heading";

const PLACEHOLDER_KEYS = Array.from(
  { length: 12 },
  (_, index) => `discover-placeholder-${index}`,
);

export function DiscoverSection({
  initialData = null,
}: {
  initialData?: ProductSearchResultResponseDto | null;
}) {
  const t = useTranslations("landing.discover");
  const { result, loading, error } = useLatestProducts(12, 1, { initialData });
  const products = result?.products ?? [];

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-10 sm:py-14">
      <SectionHeading title={t("title")} />

      <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
        {loading || error || products.length === 0
          ? PLACEHOLDER_KEYS.map((key) => (
            <div
              key={key}
              className="aspect-[3/4] w-full rounded-[10px] border border-landing-graphite bg-white"
            />
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
            className:
              "h-14 w-full rounded-[10px] px-12 text-lg sm:h-[63px] sm:w-auto sm:text-xl",
          })}
        >
          {t("cta")}
        </Link>
      </div>
    </section>
  );
}
