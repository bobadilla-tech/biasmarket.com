"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Select } from "@/components/ui/select";
import { addToCart } from "@/lib/cart";

interface Variant {
  id: string;
  name: string;
  stock: number | null;
  priceOverride: string | null;
  imageOverride: string | null;
}

interface Product {
  id: string;
  name: string;
  price: string;
  currency: string;
  soldOut: boolean;
  variants: Variant[];
  availableUntil: string | null;
  images: string[];
}

export function ProductCard(
  { slug, product }: { slug: string; product: Product },
) {
  const t = useTranslations("storefront");
  const [variantId, setVariantId] = useState("");
  const [added, setAdded] = useState(false);

  const selectedVariant = product.variants.find((v) => v.id === variantId);
  const effectivePrices = product.variants.map((v) =>
    Number(v.priceOverride ?? product.price),
  );

  const minPrice =
    effectivePrices.length > 0
      ? Math.min(...effectivePrices)
      : Number(product.price);

  const maxPrice =
    effectivePrices.length > 0
      ? Math.max(...effectivePrices)
      : Number(product.price);

  const hasDifferentVariantPrices =
    product.variants.length > 1 && minPrice !== maxPrice;

  const hasSelectedVariant = Boolean(selectedVariant);

  const price = selectedVariant
    ? Number(selectedVariant.priceOverride ?? product.price)
    : minPrice;

  const showFromPrice = hasDifferentVariantPrices && !hasSelectedVariant;
  const outOfStock = product.soldOut || selectedVariant?.stock === 0;

  const handleAddToCart = () => {
    addToCart(slug, {
      productId: product.id,
      variantId: selectedVariant?.id,
      name: selectedVariant
        ? `${product.name} (${selectedVariant.name})`
        : product.name,
      price,
      currency: product.currency,
      quantity: 1,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };

  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4">
      {(() => {
        const imageUrl = selectedVariant?.imageOverride ?? product.images?.[0];
        return imageUrl
          ? (
            <div className="relative aspect-square w-full overflow-hidden rounded-lg mb-3">
              <Image
                src={imageUrl}
                alt={product.name}
                fill
                className="object-cover"
              />
            </div>
          )
          : <div className="aspect-square bg-gray-100 rounded-lg mb-3" />;
      })()}
      <p className="font-semibold text-gray-900 text-sm">{product.name}</p>
      <p className="store-theme-active-text font-bold text-sm">
        {showFromPrice ? `${t("fromPrice")} ` : ""}
        {price} {product.currency}
      </p>
      {product.availableUntil && (
        <p className="text-xs text-gray-500">
          {t("availableUntil", {
            date: new Date(product.availableUntil).toLocaleDateString(),
          })}
        </p>
      )}

      {product.variants.length > 1 && (
        <Select
          value={variantId}
          onChange={(e) => setVariantId(e.target.value)}
          className="mt-2 w-full"
          selectClassName="rounded-lg border border-gray-200 py-1.5 pl-2 text-xs text-gray-600"
        >
          {product.variants.map((v) => (
            <option key={v.id} value={v.id} disabled={v.stock === 0}>
              {v.name}
              {v.stock === 0 ? ` ${t("variantSoldOut")}` : ""}
            </option>
          ))}
        </Select>
      )}

      {outOfStock
        ? (
          <span className="mt-2 block text-xs text-red-500 font-semibold">
            {t("soldOut")}
          </span>
        )
        : (
          <button
            onClick={handleAddToCart}
            className="store-theme-primary-button mt-2 w-full rounded-lg px-3 py-1.5 text-xs font-semibold transition"
          >
            {added ? t("addedToCart") : t("addToCart")}
          </button>
        )}
    </div>
  );
}
