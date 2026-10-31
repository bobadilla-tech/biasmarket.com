"use client";

import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Image from "next/image";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Images,
  Search,
  Shapes,
  X,
} from "lucide-react";
import { ProductCard } from "@/features/storefront/components/product-card";
import { isProductOutOfStock } from "@/features/discovery/lib/product-stock";
import {
  CategoryFilter,
  DesktopCategoryFilter,
  normalizeStoreTab,
  type StorefrontCategory,
  StoreSearchBar,
  StoreTabs,
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

export function mergeCatalogPages(
  pages: ReadonlyMap<number, RenderableSection[]>,
): RenderableSection[] {
  const products = new Map<
    string,
    { productId: string; product: RenderableSectionProduct }
  >();
  let section: RenderableSection | undefined;
  for (const [, pageSections] of [...pages.entries()].sort(
    ([pageA], [pageB]) => pageA - pageB,
  )) {
    section ??= pageSections[0];
    for (const currentSection of pageSections) {
      for (const item of currentSection.collection?.products ?? []) {
        if (!products.has(item.productId)) products.set(item.productId, item);
      }
    }
  }
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

function catalogSectionsForPage(page: number, sections: RenderableSection[]) {
  return new Map<number, RenderableSection[]>([[page, sections]]);
}

/* Keep loaded pages keyed by their server page so backward navigation cannot
 * discard products or reorder them relative to the selected server sort. */
function addCatalogPage(
  pages: ReadonlyMap<number, RenderableSection[]>,
  page: number,
  sections: RenderableSection[],
) {
  const next = new Map(pages);
  next.set(page, sections);
  return next;
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

export interface RenderableStoreReference {
  id: string;
  imageUrl: string;
  width: number;
  height: number;
  takenAt: string;
  caption: string | null;
  source: "STORE" | "BUYER";
}

function referenceDate(value: string, locale: string) {
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone: "America/Lima",
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  }).formatToParts(new Date(value));
  const part = (type: string) =>
    parts.find((item) => item.type === type)?.value ?? "";
  return `${part("day")}/${part("month")}/${part("year")}`;
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
  storeReferences = [],
  referencesPagination = null,
  referencesLoadError = false,
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
  storeReferences?: RenderableStoreReference[];
  referencesPagination?: { page: number; limit: number; total: number } | null;
  referencesLoadError?: boolean;
  catalogPagination?: { page: number; limit: number; total: number } | null;
  serverSorted?: boolean;
}) {
  const t = useTranslations("storefront");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const [selectedReference, setSelectedReference] = useState<number | null>(
    null,
  );
  const referenceDialogRef = useRef<HTMLDialogElement>(null);
  const searchString = searchParams?.toString() ?? "";
  const tabValue = searchParams?.get("tab") ?? null;
  const activeTab = catalogControls
    ? normalizeStoreTab(tabValue, showAbout)
    : "productos";
  const defaultSort = activeTab === "categorias" ? "nombre_asc" : "recientes";
  const [query, setQuery] = useState(searchParams?.get("q") ?? "");
  const [sort, setSort] = useState(searchParams?.get("orden") ?? defaultSort);
  const [categoryIds, setCategoryIds] = useState(() =>
    parseCategorySlugs(searchParams?.get("categoria") ?? null),
  );
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const catalogQueryKey = new URLSearchParams(searchString);
  catalogQueryKey.delete("page");
  const catalogKey = catalogQueryKey.toString();
  const currentPage = catalogPagination?.page ?? 1;
  const [loadedCatalog, setLoadedCatalog] = useState({
    key: catalogKey,
    pages: catalogSectionsForPage(currentPage, sections),
  });
  useEffect(() => {
    const dialog = referenceDialogRef.current;
    if (!dialog) return;
    if (selectedReference !== null && !dialog.open) dialog.showModal();
    if (selectedReference === null && dialog.open) dialog.close();
  }, [selectedReference]);
  const displayedSections =
    serverSorted && loadedCatalog.key === catalogKey
      ? mergeCatalogPages(loadedCatalog.pages)
      : sections;
  useEffect(() => {
    const params = new URLSearchParams(searchString);
    setSelectedReference(null);
    setCategoryIds(parseCategorySlugs(params.get("categoria")));
    setQuery(params.get("q") ?? "");
    setSort(params.get("orden") ?? defaultSort);
  }, [defaultSort, searchString]);

  useEffect(() => {
    setIsLoadingMore(false);
    if (!serverSorted) {
      setLoadedCatalog({
        key: catalogKey,
        pages: catalogSectionsForPage(currentPage, sections),
      });
      return;
    }

    setLoadedCatalog((previous) => {
      if (previous.key !== catalogKey)
        return {
          key: catalogKey,
          pages: catalogSectionsForPage(currentPage, sections),
        };
      return {
        key: catalogKey,
        pages: addCatalogPage(previous.pages, currentPage, sections),
      };
    });
  }, [catalogKey, currentPage, sections, serverSorted]);

  useEffect(() => {
    if (!catalogControls) return;
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams(searchString);
      const trimmed = query.trim();
      if (
        trimmed === (params.get("q") ?? "") &&
        sort === (params.get("orden") ?? defaultSort)
      ) {
        return;
      }
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
  }, [
    catalogControls,
    defaultSort,
    pathname,
    query,
    router,
    searchString,
    sort,
  ]);

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

  function changeReferencePage(page: number) {
    const params = new URLSearchParams(searchString);
    if (page <= 1) params.delete("page");
    else params.set("page", String(page));
    const queryString = params.toString();
    router.push(queryString ? `${pathname}?${queryString}` : pathname, {
      scroll: false,
    });
  }

  function moveReference(offset: number) {
    if (!storeReferences.length || selectedReference === null) return;
    setSelectedReference(
      (selectedReference + offset + storeReferences.length) %
        storeReferences.length,
    );
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
          const categoryId = relation.category.slug ?? relation.category.id;
          byId.set(categoryId, {
            ...byId.get(categoryId),
            ...relation.category,
            id: categoryId,
          });
        }
      }
    }
    return [...byId.values()];
  }, [sections, storeCategories]);
  const productCategories = categories.filter(
    (category) =>
      category.productCount === undefined || category.productCount > 0,
  );
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
            if (sort === "precio_asc") {
              return effectivePrice(a.product) - effectivePrice(b.product);
            }
            if (sort === "precio_desc") {
              return effectivePrice(b.product) - effectivePrice(a.product);
            }
            if (sort === "nombre_asc") {
              return a.product.name.localeCompare(b.product.name);
            }
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
          ) {
            return false;
          }
          if (
            !serverSorted &&
            normalizedQuery &&
            !normalizeSearchText(cp.product.name).includes(normalizedQuery)
          ) {
            return false;
          }
          if (
            catalogControls &&
            !serverSorted &&
            categoryIds.length &&
            !cp.product.categories?.some((item) =>
              categoryIds.includes(item.category.slug ?? item.category.id),
            )
          ) {
            return false;
          }
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
              className={`grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 ${
                catalogControls
                  ? "lg:grid-cols-4 xl:grid-cols-5"
                  : "lg:grid-cols-4"
              }`}
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
          <div className="space-y-5">
            <StoreSearchBar
              value={query}
              onChange={setQuery}
              sort={sort}
              onSortChange={setSort}
            />
            <div
              className={`grid items-start gap-5 ${
                productCategories.length > 0
                  ? "md:grid-cols-[13rem_minmax(0,1fr)] lg:grid-cols-[14rem_minmax(0,1fr)] xl:grid-cols-[15rem_minmax(0,1fr)]"
                  : ""
              }`}
            >
              {productCategories.length > 0 && (
                <>
                  <div className="md:hidden">
                    <CategoryFilter
                      categories={productCategories}
                      selected={categoryIds}
                      onChange={updateCategories}
                    />
                  </div>
                  <div className="hidden md:block">
                    <DesktopCategoryFilter
                      categories={productCategories}
                      selected={categoryIds}
                      onChange={updateCategories}
                    />
                  </div>
                </>
              )}
              <div className="min-w-0 space-y-5">
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
                {catalogPagination && catalogPagination.total > 0 && (
                  <nav
                    aria-label={t("catalogPagination")}
                    className="flex flex-wrap items-center justify-center gap-3 pt-2"
                  >
                    {catalogPagination.page > 1 && (
                      <button
                        type="button"
                        disabled={isLoadingMore}
                        onClick={() => {
                          const params = new URLSearchParams(searchString);
                          const previousPage = catalogPagination.page - 1;
                          if (previousPage === 1) params.delete("page");
                          else params.set("page", String(previousPage));
                          setIsLoadingMore(true);
                          router.push(`${pathname}?${params.toString()}`, {
                            scroll: false,
                          });
                        }}
                        className="min-h-11 rounded-full border border-(--store-border) px-5 text-sm font-semibold text-(--store-text) disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t("previousPage")}
                      </button>
                    )}
                    {catalogPagination.page <=
                      Math.ceil(
                        catalogPagination.total / catalogPagination.limit,
                      ) && (
                      <span
                        className="text-sm text-(--store-muted)"
                        aria-live="polite"
                      >
                        {t("pageOf", {
                          page: catalogPagination.page,
                          pages: Math.ceil(
                            catalogPagination.total / catalogPagination.limit,
                          ),
                        })}
                      </span>
                    )}
                    {catalogPagination.page * catalogPagination.limit <
                      catalogPagination.total && (
                      <button
                        type="button"
                        disabled={isLoadingMore}
                        onClick={() => {
                          const params = new URLSearchParams(searchString);
                          params.set(
                            "page",
                            String(catalogPagination.page + 1),
                          );
                          setIsLoadingMore(true);
                          router.push(`${pathname}?${params.toString()}`, {
                            scroll: false,
                          });
                        }}
                        className="store-theme-primary-button min-h-11 rounded-full px-6 text-sm font-semibold disabled:cursor-wait disabled:opacity-60"
                      >
                        {isLoadingMore ? t("loadingMore") : t("loadMore")}
                      </button>
                    )}
                  </nav>
                )}
              </div>
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
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
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
                    href={`?tab=productos&categoria=${encodeURIComponent(
                      category.slug ?? category.id,
                    )}`}
                    className="group flex min-h-[76px] items-center gap-3 rounded-2xl border border-(--store-border) bg-(--store-card) p-3 text-left text-sm font-semibold text-(--store-text) shadow-sm transition-[border-color,box-shadow,transform] hover:-translate-y-0.5 hover:border-(--store-primary) hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--store-primary) motion-reduce:transform-none motion-reduce:transition-none"
                  >
                    {category.imageUrl ? (
                      <Image
                        src={category.imageUrl}
                        alt=""
                        width={48}
                        height={48}
                        sizes="48px"
                        className="size-12 shrink-0 rounded-xl object-cover"
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gray-200 text-lg font-bold text-gray-600 dark:bg-gray-700 dark:text-gray-100"
                      >
                        {category.name
                          .trim()
                          .slice(0, 1)
                          .toLocaleUpperCase() || <Shapes className="size-5" />}
                      </span>
                    )}
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
          {storeReferences.length ||
          (referencesPagination?.total ?? 0) > 0 ||
          (referencesPagination?.page ?? 1) > 1 ? (
            <>
              {storeReferences.length ? (
                <div className="columns-2 gap-3 md:columns-3 xl:columns-4">
                  {storeReferences.map((reference, index) => (
                    <article
                      key={reference.id}
                      className="mb-3 break-inside-avoid overflow-hidden rounded-xl border border-(--store-border) bg-(--store-card)"
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedReference(index)}
                        aria-label={t("openReference", {
                          date: referenceDate(reference.takenAt, locale),
                        })}
                        className="block w-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--store-primary)"
                      >
                        <Image
                          src={reference.imageUrl}
                          alt={t("referenceImageAlt", {
                            date: referenceDate(reference.takenAt, locale),
                            caption: reference.caption ?? "",
                          })}
                          width={reference.width}
                          height={reference.height}
                          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                          className="h-auto w-full object-cover"
                        />
                      </button>
                      <div className="p-3 text-sm">
                        <p className="font-semibold text-(--store-text)">
                          {t("referenceDay", {
                            date: referenceDate(reference.takenAt, locale),
                          })}
                        </p>
                        <p className="text-(--store-muted)">
                          {t(
                            reference.source === "BUYER"
                              ? "uploadedByBuyer"
                              : "uploadedByStore",
                          )}
                        </p>
                        {reference.caption ? (
                          <p className="mt-1 break-words text-(--store-text)">
                            {reference.caption}
                          </p>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="rounded-xl border border-dashed border-(--store-border) bg-(--store-card) p-8 text-center text-(--store-muted)">
                  {t("referencesPageEmpty")}
                </p>
              )}
              {referencesPagination &&
              (referencesPagination.total > referencesPagination.limit ||
                referencesPagination.page > 1) ? (
                <nav
                  aria-label={t("referencesPagination")}
                  className="flex items-center justify-center gap-3"
                >
                  <button
                    type="button"
                    disabled={referencesPagination.page <= 1}
                    onClick={() =>
                      changeReferencePage(referencesPagination.page - 1)
                    }
                    className="min-h-11 rounded-full border border-(--store-border) px-4 disabled:opacity-50"
                  >
                    {t("previousPage")}
                  </button>
                  <span className="text-sm text-(--store-muted)">
                    {t("pageOf", {
                      page: referencesPagination.page,
                      pages: Math.max(
                        1,
                        Math.ceil(
                          referencesPagination.total /
                            referencesPagination.limit,
                        ),
                      ),
                    })}
                  </span>
                  <button
                    type="button"
                    disabled={
                      referencesPagination.page * referencesPagination.limit >=
                      referencesPagination.total
                    }
                    onClick={() =>
                      changeReferencePage(referencesPagination.page + 1)
                    }
                    className="min-h-11 rounded-full border border-(--store-border) px-4 disabled:opacity-50"
                  >
                    {t("nextPage")}
                  </button>
                </nav>
              ) : null}
              <dialog
                ref={referenceDialogRef}
                aria-label={
                  selectedReference === null
                    ? t("referencesTitle", { storeName })
                    : t("openReference", {
                        date: referenceDate(
                          storeReferences[selectedReference]?.takenAt ??
                            new Date().toISOString(),
                          locale,
                        ),
                      })
                }
                onCancel={() => setSelectedReference(null)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowLeft") {
                    event.preventDefault();
                    moveReference(-1);
                  }
                  if (event.key === "ArrowRight") {
                    event.preventDefault();
                    moveReference(1);
                  }
                }}
                className="max-h-[95dvh] max-w-[95vw] rounded-2xl border-0 bg-black/95 p-3 text-white backdrop:bg-black/80"
              >
                {selectedReference !== null &&
                storeReferences[selectedReference] ? (
                  <div className="relative grid max-h-[90dvh] min-w-[min(90vw,64rem)] place-items-center">
                    <button
                      type="button"
                      aria-label={t("closeViewer")}
                      onClick={() => setSelectedReference(null)}
                      className="absolute right-2 top-2 z-10 flex size-11 items-center justify-center rounded-full bg-white/90 text-black"
                    >
                      <X aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={t("previousImage")}
                      onClick={() => moveReference(-1)}
                      className="absolute left-2 z-10 flex size-11 items-center justify-center rounded-full bg-white/90 text-black"
                    >
                      <ArrowLeft aria-hidden="true" />
                    </button>
                    <Image
                      src={storeReferences[selectedReference].imageUrl}
                      alt={t("referenceImageAlt", {
                        date: referenceDate(
                          storeReferences[selectedReference].takenAt,
                          locale,
                        ),
                        caption:
                          storeReferences[selectedReference].caption ?? "",
                      })}
                      width={storeReferences[selectedReference].width}
                      height={storeReferences[selectedReference].height}
                      sizes="95vw"
                      className="max-h-[85dvh] max-w-full object-contain"
                    />
                    <button
                      type="button"
                      aria-label={t("nextImage")}
                      onClick={() => moveReference(1)}
                      className="absolute right-2 top-1/2 z-10 flex size-11 items-center justify-center rounded-full bg-white/90 text-black"
                    >
                      <ArrowRight aria-hidden="true" />
                    </button>
                  </div>
                ) : null}
              </dialog>
            </>
          ) : (
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
                {referencesLoadError
                  ? t("referencesLoadError")
                  : t("referencesEmpty")}
              </p>
            </div>
          )}
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
