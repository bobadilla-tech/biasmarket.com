"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ArrowUpRight, Images, Search, Shapes } from "lucide-react";
import { ProductCard } from "@/features/storefront/components/product-card";
import { isProductOutOfStock } from "@/features/discovery/lib/product-stock";
import {
  CategoryFilter,
  normalizeStoreTab,
  StoreSearchBar,
  StoreTabs,
  type StorefrontCategory,
} from "@/features/storefront/components/storefront";

export interface RenderableSectionVariant {
  id: string;
  name: string;
  stock: number | null;
  reserved: number;
  priceOverride: string | null;
  imageOverride: string | null;
}

export interface RenderableSectionProduct {
  id: string;
  name: string;
  price: string;
  currency: string;
  soldOut: boolean;
  discontinued: boolean;
  variants: RenderableSectionVariant[];
  availableUntil: string | null;
  images: string[];
  categories?: { category: StorefrontCategory }[];
}

/** Normalizes catalog text so searches ignore case and diacritical marks. */
function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase();
}

function parseCategorySlugs(value: string | null): string[] {
  return [
    ...new Set(
      (value ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function mergeCatalogPages(
  previous: RenderableSection[],
  next: RenderableSection[],
): RenderableSection[] {
  const products = new Map<
    string,
    { productId: string; product: RenderableSectionProduct }
  >();
  for (const section of [...previous, ...next]) {
    for (const item of section.collection?.products ?? []) {
      products.set(item.productId, item);
    }
  }
  const section = next[0] ?? previous[0];
  if (!section) return [];
  return [
    {
      ...section,
      collection: {
        name: "",
        products: [...products.values()],
      },
    },
  ];
}

export interface RenderableSection {
  id: string;
  type: "COLLECTION" | "BANNER" | "TEXT_BLOCK";
  content?: Record<string, unknown> | null;
  collection?: {
    name: string;
    products: { productId: string; product: RenderableSectionProduct }[];
  } | null;
}

// Shared with the real public storefront (`app/[locale]/(storefront)/store/[slug]/page.tsx`)
// so the seller's section-builder preview can't drift from what buyers see —
// see .artifacts/2026/08/20260808--storefront-section-drag-drop-preview/plan.md. Does
// *not* cover the synthesized trailing catch-all section for uncollected
// products (documented out of scope there): callers only ever pass real,
// ordered StoreSection rows.
/** Renders ordered storefront sections with optional search and category filters. */
export function StoreSectionRenderer({
  slug,
  storeName = "",
  intro,
  sections,
  aboutContent,
  aboutSections = [],
  showAbout = false,
  catalogControls = false,
  storeCategories = [],
  catalogPagination,
  serverSorted = false,
}: {
  slug: string;
  storeName?: string;
  intro?: ReactNode;
  sections: RenderableSection[];
  aboutContent?: ReactNode;
  aboutSections?: RenderableSection[];
  showAbout?: boolean;
  catalogControls?: boolean;
  storeCategories?: StorefrontCategory[];
  catalogPagination?: { page: number; limit: number; total: number } | null;
  serverSorted?: boolean;
}) {
  const t = useTranslations("storefront");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchString = searchParams?.toString() ?? "";
  const tabValue = searchParams?.get("tab") ?? null;
  const activeTab = catalogControls
    ? normalizeStoreTab(tabValue, showAbout)
    : "productos";
  const [query, setQuery] = useState(searchParams?.get("q") ?? "");
  const [sort, setSort] = useState(searchParams?.get("orden") ?? "recientes");
  const [categoryIds, setCategoryIds] = useState(() =>
    parseCategorySlugs(searchParams?.get("categoria") ?? null),
  );
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const catalogQueryKey = new URLSearchParams(searchString);
  catalogQueryKey.delete("page");
  const catalogKey = catalogQueryKey.toString();
  const [loadedCatalog, setLoadedCatalog] = useState({
    key: catalogKey,
    sections,
  });
  const displayedSections =
    serverSorted && loadedCatalog.key === catalogKey
      ? loadedCatalog.sections
      : sections;
  useEffect(() => {
    setCategoryIds(parseCategorySlugs(searchParams?.get("categoria") ?? null));
    setQuery(searchParams?.get("q") ?? "");
    setSort(searchParams?.get("orden") ?? "recientes");
  }, [searchString]);

  useEffect(() => {
    setIsLoadingMore(false);
    if (!serverSorted) {
      setLoadedCatalog({ key: catalogKey, sections });
      return;
    }

    setLoadedCatalog((previous) => {
      if (previous.key !== catalogKey || (catalogPagination?.page ?? 1) <= 1) {
        return { key: catalogKey, sections };
      }
      return {
        key: catalogKey,
        sections: mergeCatalogPages(previous.sections, sections),
      };
    });
  }, [catalogKey, catalogPagination?.page, sections, serverSorted]);

  useEffect(() => {
    if (!catalogControls) return;
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams(searchString);
      const trimmed = query.trim();
      if (trimmed) params.set("q", trimmed);
      else params.delete("q");
      if (sort) params.set("orden", sort);
      params.delete("page");
      if (params.toString() !== searchString) {
        const queryString = params.toString();
        router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
          scroll: false,
        });
      }
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [catalogControls, pathname, query, router, searchString, sort]);

  function updateCategories(values: string[]) {
    setCategoryIds(values);
    const params = new URLSearchParams(searchString);
    if (values.length) params.set("categoria", values.join(","));
    else params.delete("categoria");
    params.delete("page");
    const queryString = params.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname, {
      scroll: false,
    });
  }
  const categories = useMemo(() => {
    const byId = new Map<string, StorefrontCategory>(
      storeCategories.map((category) => [
        category.slug ?? category.id,
        {
          ...category,
          id: category.slug ?? category.id,
        },
      ]),
    );
    for (const section of sections) {
      for (const item of section.collection?.products ?? []) {
        for (const relation of item.product.categories ?? []) {
          byId.set(relation.category.slug ?? relation.category.id, {
            ...relation.category,
            id: relation.category.slug ?? relation.category.id,
          });
        }
      }
    }
    return [...byId.values()];
  }, [sections, storeCategories]);
  const normalizedQuery = catalogControls
    ? normalizeSearchText(query.trim())
    : "";
  const hasVisibleProducts = displayedSections.some((section) =>
    (section.collection?.products ?? []).some(
      ({ product }) =>
        !product.discontinued &&
        (catalogControls || !isProductOutOfStock(product)) &&
        (serverSorted ||
          !normalizedQuery ||
          normalizeSearchText(product.name).includes(normalizedQuery)) &&
        (!catalogControls ||
          serverSorted ||
          !categoryIds.length ||
          product.categories?.some((item) =>
            categoryIds.includes(item.category.slug ?? item.category.id),
          )),
    ),
  );

  function renderSections() {
    return displayedSections.map((section) => {
      if (section.type === "COLLECTION") {
        const products = [...(section.collection?.products ?? [])].sort(
          (a, b) => {
            if (serverSorted) return 0;
            const effectivePrice = (product: RenderableSectionProduct) =>
              Math.min(
                Number(product.price),
                ...product.variants.map((variant) =>
                  Number(variant.priceOverride ?? product.price),
                ),
              );
            if (sort === "precio_asc")
              return effectivePrice(a.product) - effectivePrice(b.product);
            if (sort === "precio_desc")
              return effectivePrice(b.product) - effectivePrice(a.product);
            if (sort === "nombre_asc")
              return a.product.name.localeCompare(b.product.name);
            return (
              Number(isProductOutOfStock(a.product)) -
              Number(isProductOutOfStock(b.product))
            );
          },
        );

        if (products.length === 0) return null;

        const visible = products.filter((cp) => {
          if (
            cp.product.discontinued ||
            (!catalogControls && isProductOutOfStock(cp.product))
          )
            return false;
          if (
            !serverSorted &&
            normalizedQuery &&
            !normalizeSearchText(cp.product.name).includes(normalizedQuery)
          )
            return false;
          if (
            catalogControls &&
            !serverSorted &&
            categoryIds.length &&
            !cp.product.categories?.some((item) =>
              categoryIds.includes(item.category.slug ?? item.category.id),
            )
          )
            return false;
          return true;
        });
        if (visible.length === 0) return null;

        return (
          <section key={section.id}>
            {section.collection?.name && (
              <h2 className="mb-4 text-lg font-bold uppercase text-(--store-text)">
                {section.collection.name}
              </h2>
            )}
            <div
              className={`grid grid-cols-2 gap-3 sm:gap-4 sm:grid-cols-3 ${catalogControls ? "lg:grid-cols-4 xl:grid-cols-5" : "lg:grid-cols-4"}`}
            >
              {visible.map((cp) => (
                <ProductCard
                  key={cp.product.id}
                  slug={slug}
                  product={cp.product}
                />
              ))}
            </div>
          </section>
        );
      }

      if (section.type === "BANNER") {
        return (
          <section key={section.id}>
            {Boolean(section.content?.imageUrl) && (
              <a href={(section.content?.linkUrl as string) ?? "#"}>
                <img
                  src={section.content?.imageUrl as string}
                  alt={
                    (section.content?.alt as string) ||
                    t("bannerImageGenericAlt")
                  }
                  className="w-full rounded-xl object-cover"
                />
              </a>
            )}
          </section>
        );
      }

      const paragraphs = String(section.content?.body ?? "")
        .split(/\n{2,}/)
        .map((para) => para.trim())
        .filter(Boolean);

      return (
        <section key={section.id} className="prose max-w-none">
          {paragraphs.map((para, index) => (
            <p key={index}>{para}</p>
          ))}
        </section>
      );
    });
  }

  return (
    <>
      {catalogControls && <StoreTabs showAbout={showAbout} />}
      <section
        id="store-panel-productos"
        role={catalogControls ? "tabpanel" : undefined}
        aria-labelledby={catalogControls ? "store-tab-productos" : undefined}
        hidden={catalogControls && activeTab !== "productos"}
        className="space-y-6"
      >
        {catalogControls ? (
          <div className="grid gap-4 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-6">
            <CategoryFilter
              categories={categories}
              selected={categoryIds}
              onChange={updateCategories}
            />
            <div className="min-w-0 space-y-5">
              <StoreSearchBar
                value={query}
                onChange={setQuery}
                sort={sort}
                onSortChange={setSort}
              />
              {renderSections()}
              {(normalizedQuery || categoryIds.length > 0) &&
              !hasVisibleProducts ? (
                <div
                  role="status"
                  aria-live="polite"
                  className="rounded-2xl bg-(--store-card) px-4 py-10 text-center text-sm text-(--store-muted)"
                >
                  <p>{t("noSearchResults")}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      updateCategories([]);
                    }}
                    className="mt-3 min-h-10 rounded-full bg-(--store-primary) px-4 font-semibold text-(--store-primary-text)"
                  >
                    {t("clearFilters")}
                  </button>
                </div>
              ) : displayedSections.every(
                  (section) => section.collection?.products.length === 0,
                ) ? (
                <p className="text-center text-(--store-muted)">
                  {t("noProducts")}
                </p>
              ) : null}
              {catalogPagination &&
                catalogPagination.page * catalogPagination.limit <
                  catalogPagination.total && (
                  <nav
                    aria-label={t("catalogPagination")}
                    className="flex justify-center pt-2"
                  >
                    <button
                      type="button"
                      disabled={isLoadingMore}
                      onClick={() => {
                        const params = new URLSearchParams(searchString);
                        params.set("page", String(catalogPagination.page + 1));
                        setIsLoadingMore(true);
                        router.push(`${pathname}?${params.toString()}`, {
                          scroll: false,
                        });
                      }}
                      className="store-theme-primary-button min-h-11 rounded-full px-6 text-sm font-semibold disabled:cursor-wait disabled:opacity-60"
                    >
                      {isLoadingMore ? t("loadingMore") : t("loadMore")}
                    </button>
                  </nav>
                )}
            </div>
          </div>
        ) : (
          <>
            {intro}
            {renderSections()}
            {sections.length === 0 && (
              <p className="text-center text-(--store-muted)">
                {t("noProducts")}
              </p>
            )}
          </>
        )}
      </section>
      {catalogControls && (
        <section
          id="store-panel-categorias"
          role="tabpanel"
          aria-labelledby="store-tab-categorias"
          hidden={activeTab !== "categorias"}
          className="space-y-5"
        >
          <header className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-bold tracking-tight text-(--store-text)">
                {t("categoriesTab")}
              </h2>
              <p className="mt-1 text-sm text-(--store-muted)">
                {t("categoriesTabSubtitle")}
              </p>
            </div>
            {categories.length > 0 && (
              <span className="rounded-full bg-(--store-card) px-3 py-1 text-xs font-semibold text-(--store-muted)">
                {t("categoriesCount", { count: categories.length })}
              </span>
            )}
          </header>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-xl border border-(--store-border) bg-(--store-card) px-3 focus-within:ring-2 focus-within:ring-(--store-ring)">
              <Search
                aria-hidden="true"
                className="size-4 text-(--store-muted)"
              />
              <span className="sr-only">{t("searchCategories")}</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("searchCategories")}
                className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-(--store-placeholder)"
              />
            </label>
            <label className="flex min-h-11 items-center gap-2 rounded-xl border border-(--store-border) bg-(--store-card) px-3 text-sm text-(--store-muted)">
              <span>{t("sortBy")}</span>
              <select
                aria-label={t("sortBy")}
                value={sort === "nombre_desc" ? sort : "nombre_asc"}
                onChange={(event) => setSort(event.target.value)}
                className="bg-transparent font-semibold text-(--store-text) outline-none"
              >
                <option value="nombre_asc">{t("sortNameAsc")}</option>
                <option value="nombre_desc">{t("sortNameDesc")}</option>
              </select>
            </label>
          </div>
          {categories.length ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {[...categories]
                .filter((category) =>
                  normalizeSearchText(category.name).includes(normalizedQuery),
                )
                .sort(
                  (a, b) =>
                    (sort === "nombre_desc" ? -1 : 1) *
                    a.name.localeCompare(b.name),
                )
                .map((category) => (
                  <a
                    key={category.id}
                    href={`?tab=productos&categoria=${encodeURIComponent(category.slug ?? category.id)}`}
                    className="group flex min-h-[76px] items-center gap-3 rounded-2xl border border-(--store-border) bg-(--store-card) p-3 text-left text-sm font-semibold text-(--store-text) shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-(--store-primary) hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--store-primary) motion-reduce:transform-none motion-reduce:transition-none"
                  >
                    <span
                      aria-hidden="true"
                      className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-(--store-surface) text-lg font-bold text-(--store-primary)"
                    >
                      {category.name.trim().slice(0, 1).toLocaleUpperCase() || (
                        <Shapes className="size-5" />
                      )}
                    </span>
                    <span className="min-w-0 flex-1 truncate">
                      {category.name}
                    </span>
                    <ArrowUpRight
                      aria-hidden="true"
                      className="size-4 shrink-0 text-(--store-muted) transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 motion-reduce:transition-none"
                    />
                  </a>
                ))}
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-(--store-border) bg-(--store-card) px-6 py-12 text-center">
              <Shapes
                aria-hidden="true"
                className="mx-auto size-8 text-(--store-primary)"
              />
              <p className="mt-3 text-sm font-medium text-(--store-muted)">
                {t("categoriesEmpty")}
              </p>
            </div>
          )}
        </section>
      )}
      {catalogControls && (
        <section
          id="store-panel-referencias"
          role="tabpanel"
          aria-labelledby="store-tab-referencias"
          hidden={activeTab !== "referencias"}
          className="space-y-5"
        >
          <header>
            <h2 className="text-xl font-bold text-(--store-text)">
              {t("referencesTitle", { storeName })}
            </h2>
            <p className="mt-1 text-sm text-(--store-muted)">
              {t("referencesSubtitle")}
            </p>
          </header>
          <label className="flex min-h-11 max-w-xs items-center gap-2 rounded-xl border border-(--store-border) bg-(--store-card) px-3 text-sm text-(--store-muted)">
            <span>{t("sortBy")}</span>
            <select
              aria-label={t("sortBy")}
              value={sort === "antiguas" ? sort : "recientes"}
              onChange={(event) => setSort(event.target.value)}
              className="flex-1 bg-transparent font-semibold text-(--store-text) outline-none"
            >
              <option value="recientes">{t("sortRecent")}</option>
              <option value="antiguas">{t("sortOldest")}</option>
            </select>
          </label>
          <div className="relative isolate overflow-hidden rounded-3xl border border-(--store-border) bg-(--store-card) px-6 py-12 text-center shadow-sm sm:py-16">
            <div
              aria-hidden="true"
              className="absolute -right-12 -top-16 -z-10 size-48 rounded-full bg-(--store-surface) blur-2xl"
            />
            <span className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-(--store-surface) text-(--store-primary)">
              <Images aria-hidden="true" className="size-6" />
            </span>
            <p className="mt-4 text-base font-semibold text-(--store-text)">
              {t("referencesEmptyTitle")}
            </p>
            <p className="mx-auto mt-1 max-w-md text-sm leading-6 text-(--store-muted)">
              {t("referencesEmpty")}
            </p>
          </div>
        </section>
      )}
      {catalogControls && showAbout && (
        <section
          id="store-panel-acerca"
          role="tabpanel"
          aria-labelledby="store-tab-acerca"
          hidden={activeTab !== "acerca"}
          className="space-y-6"
        >
          <header>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-(--store-primary)">
              {t("aboutEyebrow")}
            </p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-(--store-text)">
              {t("aboutTab")}
            </h2>
          </header>
          {aboutContent}
          {renderSectionsForAbout()}
        </section>
      )}
    </>
  );

  function renderSectionsForAbout() {
    // Keep the legacy banner and prose sections in their original order under
    // the About tab, while collections are represented by the paginated grid.
    return aboutSections.map((section) => {
      if (section.type === "COLLECTION") return null;
      if (section.type === "BANNER") {
        return (
          <section key={section.id}>
            {Boolean(section.content?.imageUrl) && (
              <a href={(section.content?.linkUrl as string) ?? "#"}>
                <img
                  src={section.content?.imageUrl as string}
                  alt={
                    (section.content?.alt as string) ||
                    t("bannerImageGenericAlt")
                  }
                  className="w-full rounded-2xl object-cover"
                />
              </a>
            )}
          </section>
        );
      }
      const paragraphs = String(section.content?.body ?? "")
        .split(/\n{2,}/)
        .map((paragraph) => paragraph.trim())
        .filter(Boolean);
      return (
        <section key={section.id} className="prose max-w-none">
          {paragraphs.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </section>
      );
    });
  }
}
