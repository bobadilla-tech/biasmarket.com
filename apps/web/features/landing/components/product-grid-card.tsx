"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { SearchProductResponseDto } from "@biasmarket/types";

export function ProductGridCard({
  product,
  className,
  variant = "grid",
}: {
  product: SearchProductResponseDto;
  className?: string;
  variant?: "grid" | "row";
}) {
  const t = useTranslations("landing.products");
  const isRow = variant === "row";

  return (
    <Link
      href={`/store/${product.store.slug}/product/${product.id}`}
      className={cn(
        "group flex flex-col overflow-hidden rounded-[10px] bg-white transition hover:shadow-md",
        isRow
          ? "w-[174px] shrink-0 border border-transparent p-[9.5px]"
          : "border border-landing-graphite",
        className,
      )}
    >
      <div
        className={cn(
          "relative aspect-square w-full overflow-hidden rounded-[10px] bg-white",
          !isRow && "aspect-[3/4] rounded-none",
        )}
      >
        {product.images[0] ? (
          <Image
            src={product.images[0]}
            alt={product.name}
            fill
            sizes={isRow ? "174px" : "(min-width: 768px) 200px, 160px"}
            className="object-cover"
          />
        ) : (
          <div className="size-full bg-muted" />
        )}
      </div>
      <div
        className={cn(
          "flex min-w-0 flex-col",
          isRow
            ? "gap-0 pt-1.5"
            : "gap-0.5 px-2.5 py-2 sm:gap-1 sm:px-3 sm:py-2.5",
        )}
      >
        <p
          className={cn(
            "truncate font-semibold text-black",
            isRow ? "text-[15px] leading-[18px]" : "text-xs sm:text-sm",
          )}
        >
          {product.name}
        </p>
        {isRow ? (
          <p className="truncate text-[10px] leading-3 font-medium text-[#696969]">
            @{product.store.slug}
          </p>
        ) : null}
        <p
          className={cn(
            "font-bold",
            isRow
              ? "text-[19px] leading-[23px] text-[#FC17A0]"
              : "text-landing-title text-xs sm:text-sm",
          )}
        >
          {product.currency} {product.price}
        </p>
        {!isRow ? (
          <p className="hidden truncate text-xs text-muted-foreground sm:block">
            {t("viewStore", { name: product.store.name })}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
