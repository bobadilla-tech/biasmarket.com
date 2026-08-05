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
  description: string;
  price: string;
  currency: string;
  soldOut: boolean;
  variants: Variant[];
  images: string[];
}

export function ProductDetailView(
  { slug, product }: { slug: string; product: Product },
) {
  const t = useTranslations("storefront");
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? "");
  const [added, setAdded] = useState(false);

  const selectedVariant = product.variants.find((v) => v.id === variantId);
  const price = Number(selectedVariant?.priceOverride ?? product.price);
  const imageUrl = selectedVariant?.imageOverride ?? product.images?.[0];
  const outOfStock = product.soldOut || selectedVariant?.stock === 0;

  const handleAddToCart = () => {
    addToCart(slug, {
      productId: product.id,
      variantId: selectedVariant?.id,
      name: product.name,
      variantLabel: selectedVariant?.name,
      image: selectedVariant?.imageOverride ?? product.images?.[0],
      price,
      currency: product.currency,
      quantity: 1,
    });
    setAdded(true);
    setTimeout(() => setAdded(false), 1200);
  };

  return (
    <div className="grid gap-8 sm:grid-cols-2">
      {imageUrl
        ? (
          <div className="relative aspect-square w-full overflow-hidden rounded-2xl">
            <Image
              src={imageUrl}
              alt={product.name}
              fill
              className="object-cover"
            />
          </div>
        )
        : <div className="aspect-square w-full rounded-2xl bg-gray-100" />}

      <div>
        <h1 className="text-2xl font-bold text-gray-900">{product.name}</h1>
        <p className="mt-2 text-xl font-bold store-theme-active-text">
          {price} {product.currency}
        </p>
        {product.description
          ? (
            <p className="mt-4 whitespace-pre-line text-sm text-gray-600">
              {product.description}
            </p>
          )
          : null}

        {product.variants.length > 1 && (
          <Select
            value={variantId}
            onChange={(e) => setVariantId(e.target.value)}
            className="mt-4 w-full max-w-xs"
            selectClassName="rounded-lg border border-gray-200 py-2 pl-3 text-sm text-gray-600"
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
            <span className="mt-4 block text-sm font-semibold text-red-500">
              {t("productDetail.soldOut")}
            </span>
          )
          : (
            <button
              onClick={handleAddToCart}
              className="store-theme-primary-button mt-4 w-full max-w-xs rounded-xl px-4 py-2.5 text-sm font-semibold transition sm:w-auto"
            >
              {added ? t("addedToCart") : t("addToCart")}
            </button>
          )}
      </div>
    </div>
  );
}
