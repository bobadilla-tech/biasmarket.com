"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { ProductSearchResultResponseDto } from "@biasmarket/types";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { LoadingState } from "@/components/shared/loading-state";
import { useLatestProducts } from "@/features/discovery";
import { ProductGridCard } from "./product-grid-card";

export function DiscoverSection({
  initialData = null,
}: {
  initialData?: ProductSearchResultResponseDto | null;
}) {
  const t = useTranslations("landing.discover");
  const { result, loading, error, refetch } = useLatestProducts(6, 1, {
    initialData,
  });
  const products = result?.products ?? [];
  const collectionState = loading ? (
    <LoadingState variant="cards" rows={6} className="col-span-full" />
  ) : error ? (
    <div className="col-span-full">
      <ErrorState
        message={t("error")}
        retry={() => void refetch()}
        retryLabel={t("retry")}
      />
    </div>
  ) : products.length === 0 ? (
    <div className="col-span-full">
      <EmptyState message={t("empty")} />
    </div>
  ) : null;

  return (
    <section className="mx-auto max-w-7xl px-6 py-8 sm:px-10 sm:py-14">
      <div className="sm:hidden">
        <h2 className="text-[21px] leading-[26px] font-bold text-landing-ink">
          {t("title")}
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-2.5">
          {collectionState ??
            products
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
            className="flex min-h-[39px] h-auto min-w-[186px] max-w-full items-center justify-center rounded-lg bg-cta-strong px-6 py-3 text-center text-sm font-medium text-white shadow-[var(--shadow-soft)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-cta-active hover:shadow-[var(--shadow-raised)]"
          >
            {t("cta")}
          </Link>
        </div>
      </div>

      {/* Tablet/desktop — Figma "Más por descubrir" */}
      <div className="hidden sm:block">
        <h2 className="text-[41px] leading-[50px] font-bold text-landing-ink">
          {t("title")}
        </h2>

        <div className="mt-6 grid grid-cols-3 gap-[12.3px] sm:mt-8 sm:grid-cols-6">
          {collectionState ??
            products
              .slice(0, 6)
              .map((product) => (
                <ProductGridCard
                  key={product.id}
                  product={product}
                  variant="row"
                  className="!w-full !rounded-lg !border-transparent"
                />
              ))}
        </div>

        <div className="mt-8 flex justify-center sm:mt-10">
          <Link
            href="/search"
            className="flex min-h-[74px] h-auto min-w-[416px] max-w-full items-center justify-center rounded-2xl bg-cta px-8 py-5 text-center text-[24px] leading-[29px] font-medium text-white shadow-[var(--shadow-soft)] transition-all duration-200 hover:-translate-y-0.5 hover:bg-cta-hover hover:shadow-[var(--shadow-raised)]"
          >
            {t("cta")}
          </Link>
        </div>
      </div>
    </section>
  );
}
