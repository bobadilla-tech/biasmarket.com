"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { ProductCard } from "@/features/storefront/components/product-card";
import { isProductOutOfStock } from "@/features/discovery/lib/product-stock";
import {
  CategoryFilter,
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
  sections,
  catalogControls = false,
}: {
  slug: string;
  sections: RenderableSection[];
  catalogControls?: boolean;
}) {
  const t = useTranslations("storefront");
  const [query, setQuery] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const categories = useMemo(() => {
    const byId = new Map<string, StorefrontCategory>();
    for (const section of sections) {
      for (const item of section.collection?.products ?? []) {
        for (const relation of item.product.categories ?? []) {
          byId.set(relation.category.id, relation.category);
        }
      }
    }
    return [...byId.values()];
  }, [sections]);
  const normalizedQuery = catalogControls
    ? normalizeSearchText(query.trim())
    : "";
  const hasVisibleProducts = sections.some((section) =>
    (section.collection?.products ?? []).some(
      ({ product }) =>
        !product.discontinued &&
        !isProductOutOfStock(product) &&
        (!normalizedQuery ||
          normalizeSearchText(product.name).includes(normalizedQuery)) &&
        (!catalogControls ||
          !categoryId ||
          product.categories?.some((item) => item.category.id === categoryId)),
    ),
  );

  return (
    <>
      {catalogControls && (
        <div className="mb-6 space-y-4">
          <StoreTabs
            categories={categories}
            active={categoryId}
            onChange={setCategoryId}
          />
          <StoreSearchBar value={query} onChange={setQuery} />
          <CategoryFilter
            categories={categories}
            selected={categoryId}
            onChange={setCategoryId}
          />
        </div>
      )}
      {sections.map((section) => {
        if (section.type === "COLLECTION") {
          const products = [...(section.collection?.products ?? [])].sort(
            (a, b) =>
              Number(isProductOutOfStock(a.product)) -
              Number(isProductOutOfStock(b.product)),
          );

          if (products.length === 0) return null;

          const visible = products.filter((cp) => {
            if (cp.product.discontinued || isProductOutOfStock(cp.product))
              return false;
            if (
              normalizedQuery &&
              !normalizeSearchText(cp.product.name).includes(normalizedQuery)
            )
              return false;
            if (
              catalogControls &&
              categoryId &&
              !cp.product.categories?.some(
                (item) => item.category.id === categoryId,
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
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
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

        // Back-compat: existing rows are `{ body: "line\n\nline" }` — a single
        // string. Split on blank lines so each paragraph gets its own <p>
        // instead of one flat block with collapsed line breaks.
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
      })}
      {(normalizedQuery || categoryId) && !hasVisibleProducts ? (
        <p
          role="status"
          aria-live="polite"
          className="rounded-2xl bg-(--store-card) px-4 py-12 text-center text-sm text-(--store-muted)"
        >
          {t("noSearchResults")}
        </p>
      ) : null}
    </>
  );
}
