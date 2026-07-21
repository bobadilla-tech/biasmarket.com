"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { addToCart } from "@/lib/cart";

interface Variant {
  id: string;
  name: string;
  stock: number | null;
  priceOverride: string | null;
}

interface Product {
  id: string;
  name: string;
  price: string;
  soldOut: boolean;
  variants: Variant[];
  availableUntil: string | null;
}

export function ProductCard({ slug, product }: { slug: string; product: Product }) {
  const t = useTranslations("storefront");
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? "");
  const [added, setAdded] = useState(false);

  const selectedVariant = product.variants.find((v) => v.id === variantId);
  const price = Number(selectedVariant?.priceOverride ?? product.price);
  const outOfStock = product.soldOut || selectedVariant?.stock === 0;

  const handleAddToCart = () => {
    addToCart(slug, {
      productId: product.id,
      variantId: selectedVariant?.id,
      name: selectedVariant ? `${product.name} (${selectedVariant.name})` : product.name,
      price,
      quantity: 1,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      <div className="aspect-square bg-gray-100 rounded-lg mb-3" />
      <p className="font-semibold text-gray-900 text-sm">{product.name}</p>
      <p className="text-emerald-600 font-bold text-sm">${price}</p>
      {product.availableUntil && (
        <p className="text-xs text-gray-500">
          {t("availableUntil", { date: new Date(product.availableUntil).toLocaleDateString() })}
        </p>
      )}

      {product.variants.length > 0 && (
        <select
          value={variantId}
          onChange={(e) => setVariantId(e.target.value)}
          className="mt-2 w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs text-gray-600"
        >
          {product.variants.map((v) => (
            <option key={v.id} value={v.id} disabled={v.stock === 0}>
              {v.name}
              {v.stock === 0 ? ` ${t("variantSoldOut")}` : ""}
            </option>
          ))}
        </select>
      )}

      {outOfStock ? (
        <span className="mt-2 block text-xs text-red-500 font-semibold">{t("soldOut")}</span>
      ) : (
        <button
          onClick={handleAddToCart}
          className="mt-2 w-full rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600"
        >
          {added ? t("addedToCart") : t("addToCart")}
        </button>
      )}
    </div>
  );
}
