"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import type { SearchProductResponseDto } from "@biasmarket/types";

export function ProductGridCard({
  product,
  className,
}: {
  product: SearchProductResponseDto;
  className?: string;
}) {
  const t = useTranslations("landing.products");

  return (
    <Link
      href={`/store/${product.store.slug}/product/${product.id}`}
      className={cn(
        "group flex flex-col overflow-hidden rounded-[10px] border border-landing-graphite bg-white transition hover:shadow-md",
        className,
      )}
    >
      <div className="relative aspect-[3/4] w-full overflow-hidden bg-white">
        {product.images[0] ? (
          <Image
            src={product.images[0]}
            alt={product.name}
            fill
            sizes="(min-width: 768px) 200px, 160px"
            className="object-cover"
          />
        ) : (
          <div className="size-full bg-muted" />
        )}
      </div>
      <div className="flex flex-col gap-0.5 px-2.5 py-2 sm:gap-1 sm:px-3 sm:py-2.5">
        <p className="truncate text-xs font-semibold text-black sm:text-sm">
          {product.name}
        </p>
        <p className="text-xs font-bold text-landing-title sm:text-sm">
          {product.currency} {product.price}
        </p>
        <p className="hidden truncate text-xs text-muted-foreground sm:block">
          {t("viewStore", { name: product.store.name })}
        </p>
      </div>
    </Link>
  );
}
