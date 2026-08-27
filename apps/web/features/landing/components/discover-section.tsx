"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { ProductSearchResultResponseDto } from "@biasmarket/types";
import { useLatestProducts } from "@/features/discovery";
import { ProductGridCard } from "./product-grid-card";

const PLACEHOLDER_KEYS = Array.from(
  { length: 12 },
  (_, index) => `discover-placeholder-${index}`,
);

const ROW_PLACEHOLDER_KEYS = Array.from(
  { length: 4 },
  (_, index) => `discover-row-placeholder-${index}`,
);

export function DiscoverSection({
  initialData = null,
}: {
  initialData?: ProductSearchResultResponseDto | null;
}) {
  const t = useTranslations("landing.discover");
  const { result, loading, error } = useLatestProducts(6, 1, { initialData });
  const products = result?.products ?? [];

  return (
    <section className="mx-auto max-w-7xl px-6 py-8 sm:px-10 sm:py-14">
      <div className="sm:hidden">
        <h2 className="text-[21px] leading-[26px] font-bold text-black">
          {t("title")}
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {loading || error || products.length === 0
            ? ROW_PLACEHOLDER_KEYS.map((key) => (
                <div
                  key={key}
                  className="animate-pulse rounded-[10px] bg-muted p-[9.5px]"
                >
                  <div className="aspect-square w-full rounded-[10px]" />
                </div>
              ))
            : products
                .slice(0, 4)
                .map((product) => (
                  <ProductGridCard
                    key={product.id}
                    product={product}
                    variant="row"
                    className="w-full"
                  />
                ))}
        </div>
        <div className="mt-5 flex justify-center">
          <Link
            href="/search"
            className="flex h-[39px] w-[186px] items-center justify-center rounded-[10px] bg-[#FC17A0] text-sm font-medium text-white transition-colors hover:bg-[#e0128d]"
          >
            {t("cta")}
          </Link>
        </div>
      </div>

      {/* Tablet/desktop — Figma "Más por descubrir" */}
      <div className="hidden sm:block">
        <h2 className="text-[41px] leading-[50px] font-bold text-black">
          {t("title")}
        </h2>

        <div className="mt-6 grid grid-cols-3 gap-[12.3px] sm:mt-8 sm:grid-cols-6">
          {loading || error || products.length === 0
            ? PLACEHOLDER_KEYS.slice(0, 6).map((key) => (
                <div
                  key={key}
                  className="aspect-square w-full rounded-[10px] border border-landing-graphite bg-white"
                />
              ))
            : products
                .slice(0, 6)
                .map((product) => (
                  <ProductGridCard
                    key={product.id}
                    product={product}
                    variant="row"
                    className="!w-full !rounded-[10px] !border-transparent"
                  />
                ))}
        </div>

        <div className="mt-8 flex justify-center sm:mt-10">
          <Link
            href="/search"
            className="flex h-[74px] w-[416px] items-center justify-center rounded-[16.6px] bg-[#FC17A0] text-[24px] leading-[29px] font-medium text-white transition-colors hover:bg-[#e0128d]"
          >
            {t("cta")}
          </Link>
        </div>
      </div>
    </section>
  );
}
