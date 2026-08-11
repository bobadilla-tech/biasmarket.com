"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Link, useRouter } from "@/i18n/navigation";
import { LoadingState } from "@/components/shared/loading-state";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { cn } from "@/lib/utils";
import { useProductSearch } from "@/features/discovery";

const PAGE_SIZE = 24;

type Sort = "latest" | "bestseller";

interface SearchPageClientProps {
  initialQuery: string;
  initialCategory?: string;
  initialSort: Sort;
  initialPage: number;
}

function buildSearchPath(
  q: string,
  category: string | null,
  sort: Sort,
  page: number,
) {
  const params = new URLSearchParams();
  if (q.trim()) params.set("q", q.trim());
  if (category) params.set("category", category);
  if (sort === "bestseller") params.set("sort", sort);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/search?${query}` : "/search";
}

export function ProductSearchPageClient({
  initialQuery,
  initialCategory,
  initialSort,
  initialPage,
}: SearchPageClientProps) {
  const t = useTranslations("storefront.productSearch");
  const tCommon = useTranslations("common");
  const tCategories = useTranslations("landing.categories");
  const router = useRouter();
  const [draft, setDraft] = useState(initialQuery);

  const category = initialCategory ?? null;
  const sort = initialSort;
  const page = initialPage;
  const { result, loading, error } = useProductSearch(initialQuery, page, {
    category: category ?? undefined,
    sort,
  });

  const totalPages = result
    ? Math.max(1, Math.ceil(result.total / PAGE_SIZE))
    : 1;
  const categories = tCategories.raw("items") as
    { key: string; name: string }[] | undefined;

  const navigate = (next: {
    q?: string;
    category?: string | null;
    sort?: Sort;
    page?: number;
  }) => {
    router.replace(
      buildSearchPath(
        next.q ?? draft,
        next.category !== undefined ? next.category : category,
        next.sort ?? sort,
        next.page ?? page,
      ),
    );
  };

  return (
    <div className="mx-auto max-w-5xl px-6 py-16 sm:px-10">
      <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
        {t("title")}
      </h1>
      <p className="mt-3 text-muted-foreground">{t("subtitle")}</p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          navigate({ q: draft, page: 1 });
        }}
        className="mt-8 max-w-sm"
      >
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t("searchPlaceholder")}
          className="h-12 rounded-2xl"
        />
      </form>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => navigate({ category: null, page: 1 })}
          className={cn(
            "rounded-full border px-4 py-1.5 text-sm font-medium transition",
            category === null
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card text-foreground hover:bg-muted",
          )}
        >
          {t("allCategories")}
        </button>
        {categories?.map(({ key, name }) => (
          <button
            key={key}
            type="button"
            onClick={() => navigate({ category: name, page: 1 })}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-medium transition",
              category === name
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-muted",
            )}
          >
            {name}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2">
        {(["latest", "bestseller"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => navigate({ sort: value, page: 1 })}
            className={cn(
              "rounded-full border px-4 py-1.5 text-sm font-medium transition",
              sort === value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-foreground hover:bg-muted",
            )}
          >
            {value === "latest" ? t("sortLatest") : t("sortBestsellers")}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {loading ? (
          <LoadingState />
        ) : error || !result ? (
          <ErrorState message={tCommon("networkError")} />
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
                      <Image
                        src={product.images[0]}
                        alt={product.name}
                        fill
                        className="object-cover"
                      />
                    </div>
                  ) : (
                    <div className="aspect-square w-full rounded-xl bg-muted" />
                  )}
                  <p className="mt-2 truncate text-sm font-semibold">
                    {product.name}
                  </p>
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
                  onClick={() => navigate({ page: page - 1 })}
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
                  onClick={() => navigate({ page: page + 1 })}
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
