"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { Bell, Check, Clock, ShoppingCart, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Link } from "@/i18n/navigation";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { addToCart } from "@/lib/cart";
import { RestockInterestDialog } from "@/features/restock";
import { isProductOutOfStock } from "@/features/discovery/lib/product-stock";
import { ImagePlaceholder } from "@/features/storefront/components/storefront";

interface Variant {
  id: string;
  name: string;
  stock: number | null;
  reserved: number;
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

/** Renders a themed product card with variant selection, cart, and restock actions. */
export function ProductCard({
  slug,
  product,
}: {
  slug: string;
  product: Product;
}) {
  const t = useTranslations("storefront");
  const availableStock = (v: Variant) =>
    v.stock === null ? Infinity : v.stock - v.reserved;
  const [variantId, setVariantId] = useState(() =>
    product.variants.length === 1 ? (product.variants[0]?.id ?? "") : "",
  );
  const [added, setAdded] = useState(false);
  const [restockOpen, setRestockOpen] = useState(false);
  const restockTriggerRef = useRef<HTMLButtonElement>(null);

  const selectedVariant =
    product.variants.length === 1
      ? product.variants[0]
      : product.variants.find((v) => v.id === variantId);
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
  const outOfStock =
    isProductOutOfStock(product) ||
    (selectedVariant ? availableStock(selectedVariant) <= 0 : false);

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
    toast.success(t("addedToCart"), {
      description: product.name,
      duration: 1500,
    });
  };

  return (
    <article
      data-store-card
      className="group rounded-[1.35rem] border border-(--store-border) bg-(--store-card) p-2.5 shadow-[0_4px_14px_color-mix(in_srgb,var(--store-primary)_7%,transparent)] transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-1 hover:border-(--store-primary)/35 hover:shadow-[0_16px_32px_color-mix(in_srgb,var(--store-primary)_15%,transparent)] sm:p-2.5"
    >
      <Link href={`/store/${slug}/product/${product.id}`}>
        {(() => {
          const imageUrl =
            selectedVariant?.imageOverride ?? product.images?.[0];
          return imageUrl ? (
            <div className="photocard-frame relative mb-3 aspect-square w-full overflow-hidden rounded-[1.1rem] bg-(--store-surface)">
              <Image
                src={imageUrl}
                alt={product.name}
                fill
                sizes="(min-width: 768px) 220px, 50vw"
                className={cn(
                  "object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035]",
                  outOfStock && "opacity-70 grayscale",
                )}
              />
              {outOfStock && (
                <div className="absolute inset-x-0 top-2 flex justify-center">
                  <span className="flex items-center gap-1 rounded-full border border-(--store-border) bg-(--store-card) px-3 py-1 text-xs font-semibold text-(--store-muted)">
                    <Clock className="size-3.5" />
                    {t("soldOut")}
                  </span>
                </div>
              )}
            </div>
          ) : (
            <ImagePlaceholder
              alt={t("productImageAlt", { name: product.name })}
              className="mb-3 rounded-lg"
            />
          );
        })()}
        <h3 className="line-clamp-2 min-h-10 text-sm font-bold uppercase leading-5 text-(--store-text)">
          {product.name}
        </h3>
        <p className="store-theme-active-text font-bold text-sm">
          {showFromPrice ? `${t("fromPrice")} ` : ""}
          {price} {product.currency}
        </p>
        {product.availableUntil && (
          <p className="text-xs text-(--store-muted)">
            {t("availableUntil", {
              date: new Date(product.availableUntil).toLocaleDateString(),
            })}
          </p>
        )}
      </Link>

      {product.variants.length > 1 && (
        <Select
          value={variantId}
          onChange={(e) => setVariantId(e.target.value)}
          aria-label={t("chooseVariant", { product: product.name })}
          className="mt-2 min-h-11 w-full"
          selectClassName="rounded-lg border border-(--store-border) py-1.5 pl-2 text-base text-(--store-muted)"
        >
          <option value="">{t("chooseOption")}</option>
          {product.variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
              {availableStock(v) <= 0 ? ` ${t("variantSoldOut")}` : ""}
            </option>
          ))}
        </Select>
      )}

      {product.variants.length > 1 && !selectedVariant && !outOfStock ? (
        <button
          type="button"
          disabled
          className="store-theme-primary-button mt-2 min-h-11 w-full cursor-not-allowed rounded-lg px-3 py-1.5 text-sm font-semibold opacity-50"
        >
          <span className="inline-flex items-center justify-center gap-2">
            <ShoppingCart aria-hidden="true" className="size-4" />
            {t("addToCart")}
          </span>
        </button>
      ) : outOfStock ? (
        <button
          type="button"
          ref={restockTriggerRef}
          onClick={() => setRestockOpen(true)}
          className="mt-2 flex min-h-11 w-full items-center justify-center gap-1.5 rounded-lg border border-(--store-border) bg-(--store-card) px-3 py-1.5 text-sm font-semibold text-(--store-muted) transition hover:bg-(--store-surface) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--store-primary)] focus-visible:ring-offset-2"
        >
          <Bell className="size-3.5" />
          {t("registerInterest")}
        </button>
      ) : (
        <button
          type="button"
          onClick={handleAddToCart}
          className={`store-theme-primary-button mt-2 min-h-11 w-full rounded-xl px-3 py-1.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--store-primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${
            added ? "fan-added" : ""
          }`}
        >
          <span className="inline-flex items-center justify-center gap-2">
            {added ? (
              <span className="relative inline-flex items-center">
                <Check aria-hidden="true" className="size-4" />
                <Sparkles
                  aria-hidden="true"
                  className="fan-pop absolute -top-2 -right-3 size-3.5 text-amber-200"
                />
              </span>
            ) : (
              <ShoppingCart aria-hidden="true" className="size-4" />
            )}
            {added ? t("addedToCart") : t("addToCart")}
          </span>
        </button>
      )}

      <RestockInterestDialog
        open={restockOpen}
        onOpenChange={setRestockOpen}
        slug={slug}
        productId={product.id}
        variantId={selectedVariant?.id}
        triggerRef={restockTriggerRef}
        productName={product.name}
        variantLabel={selectedVariant?.name}
      />
    </article>
  );
}
