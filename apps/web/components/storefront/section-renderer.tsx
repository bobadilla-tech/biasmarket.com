"use client";

import { ProductCard } from "./product-card";
import { isProductOutOfStock } from "@/features/discovery/lib/product-stock";

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
// see docs/plans/2026-08-08-storefront-section-drag-drop-preview.md. Does
// *not* cover the synthesized trailing catch-all section for uncollected
// products (documented out of scope there): callers only ever pass real,
// ordered StoreSection rows.
export function StoreSectionRenderer(
  { slug, sections }: { slug: string; sections: RenderableSection[] },
) {
  return (
    <>
      {sections.map((section) => {
        if (section.type === "COLLECTION") {
          const products = [...(section.collection?.products ?? [])].sort(
            (a, b) =>
              Number(isProductOutOfStock(a.product)) -
              Number(isProductOutOfStock(b.product)),
          );

          if (products.length === 0) return null;

          const visible = products.filter(
            (cp) =>
              !cp.product.discontinued && !isProductOutOfStock(cp.product),
          );
          if (visible.length === 0) return null;

          return (
            <section key={section.id}>
              {section.collection?.name && (
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  {section.collection.name}
                </h2>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
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
                    alt={(section.content?.alt as string) ?? ""}
                    className="w-full rounded-xl object-cover"
                  />
                </a>
              )}
            </section>
          );
        }

        return (
          <section key={section.id} className="prose max-w-none">
            <p>{section.content?.body as string}</p>
          </section>
        );
      })}
    </>
  );
}
