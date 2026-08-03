"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { LoadingState } from "@/components/shared/loading-state";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { useProductSearch } from "@/features/discovery";

const PAGE_SIZE = 24;

export function ProductSearchPageClient() {
  const t = useTranslations("storefront.productSearch");
  const tCommon = useTranslations("common");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { result, loading, error } = useProductSearch(q, page);

  const totalPages = result ? Math.max(1, Math.ceil(result.total / PAGE_SIZE)) : 1;
  const hasQuery = q.trim().length > 0;

  return (
    <div className="mx-auto max-w-5xl px-6 py-16 sm:px-10">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("title")}</h1>
      <p className="mt-3 text-muted-foreground">{t("subtitle")}</p>

      <Input
        value={q}
        onChange={(event) => {
          setQ(event.target.value);
          setPage(1);
        }}
        placeholder={t("searchPlaceholder")}
        className="mt-8 h-12 max-w-sm rounded-2xl"
      />

      <div className="mt-8">
        {!hasQuery ? (
          <EmptyState message={t("prompt")} />
        ) : loading ? (
          <LoadingState />
        ) : error || !result ? (
          <ErrorState message={error ?? tCommon("networkError")} />
        ) : result.products.length === 0 ? (
          <EmptyState message={t("empty")} />
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
              {result.products.map((product) => (
                <Link
                  key={product.id}
                  href={`/store/${product.store.slug}/product/${product.id}`}
                  className="rounded-2xl border border-border bg-card p-3 transition hover:shadow-md"
                >
                  {product.images[0] ? (
                    <div className="relative aspect-square w-full overflow-hidden rounded-xl">
                      <Image src={product.images[0]} alt={product.name} fill className="object-cover" />
                    </div>
                  ) : (
                    <div className="aspect-square w-full rounded-xl bg-muted" />
                  )}
                  <p className="mt-2 truncate text-sm font-semibold">{product.name}</p>
                  <p className="text-sm font-bold text-primary">
                    {product.currency} {product.price}
                  </p>
                  <p className="truncate text-xs text-muted-foreground">
                    {t("viewStore", { name: product.store.name })}
                  </p>
                </Link>
              ))}
            </div>
            {totalPages > 1 ? (
              <div className="mt-8 flex items-center justify-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  {t("previous")}
                </Button>
                <span className="text-sm text-muted-foreground">
                  {t("pageOf", { page, total: totalPages })}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                >
                  {t("next")}
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
