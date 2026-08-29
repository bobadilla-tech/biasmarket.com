"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function ImageGallery({
  images: rawImages,
  alt,
  className,
  outOfStock,
}: {
  images: string[];
  alt: string;
  className?: string;
  outOfStock?: boolean;
}) {
  const t = useTranslations("storefront.gallery");
  // Collapse repeated URLs so `key={img}` is unique and a duplicate doesn't
  // get its own thumbnail. `new Set` preserves insertion order, so the
  // caller's ordering (variant override first — see product-detail-view) is
  // kept.
  const images = Array.from(new Set(rawImages));
  const [current, setCurrent] = useState(0);

  const imagesKey = JSON.stringify(images);
  useEffect(() => {
    setCurrent(0);
  }, [imagesKey]);

  const safeCurrent =
    images.length > 0 ? Math.min(current, images.length - 1) : 0;
  const hasMultiple = images.length > 1;

  if (images.length === 0) {
    return (
      <div
        className={cn(
          "aspect-square w-full rounded-2xl bg-gray-100",
          className,
        )}
      />
    );
  }

  const arrowClass =
    "absolute top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white transition hover:bg-black/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/40";

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-gray-50">
        <Image
          src={images[safeCurrent]}
          alt={`${alt}, ${t("imagePosition", {
            current: safeCurrent + 1,
            total: images.length,
          })}`}
          fill
          sizes="(min-width: 640px) 50vw, 100vw"
          className={cn("object-contain", outOfStock && "opacity-70 grayscale")}
        />
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="sr-only"
        >
          {t("imagePosition", {
            current: safeCurrent + 1,
            total: images.length,
          })}
        </div>
        {hasMultiple && (
          <>
            <button
              type="button"
              aria-label={t("previousImage")}
              onClick={() =>
                setCurrent((prev) =>
                  prev === 0 ? images.length - 1 : prev - 1,
                )
              }
              className={cn(arrowClass, "left-2")}
            >
              <ChevronLeft aria-hidden="true" className="size-4" />
            </button>
            <button
              type="button"
              aria-label={t("nextImage")}
              onClick={() =>
                setCurrent((prev) =>
                  prev === images.length - 1 ? 0 : prev + 1,
                )
              }
              className={cn(arrowClass, "right-2")}
            >
              <ChevronRight aria-hidden="true" className="size-4" />
            </button>
          </>
        )}
      </div>
      {hasMultiple && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {images.map((img, index) => (
            <button
              key={img}
              type="button"
              aria-label={t("thumbnail", {
                current: index + 1,
                total: images.length,
              })}
              aria-current={index === safeCurrent ? "true" : undefined}
              onClick={() => setCurrent(index)}
              className={cn(
                "relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--store-primary)] focus-visible:ring-offset-2",
                index === safeCurrent
                  ? "border-[var(--store-primary)]"
                  : "border-transparent opacity-70 hover:opacity-100",
              )}
            >
              <Image
                src={img}
                alt={`${alt} ${index + 1}`}
                fill
                sizes="64px"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
