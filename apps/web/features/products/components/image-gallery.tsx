"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function ImageGallery({
  images,
  alt,
  className,
  outOfStock,
}: {
  images: string[];
  alt: string;
  className?: string;
  outOfStock?: boolean;
}) {
  const [current, setCurrent] = useState(0);

  const imagesKey = images.join(",");
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

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative aspect-square w-full overflow-hidden rounded-2xl bg-gray-50">
        <Image
          src={images[safeCurrent]}
          alt={alt}
          fill
          className={cn("object-contain", outOfStock && "opacity-70 grayscale")}
        />
        {hasMultiple && (
          <>
            <button
              type="button"
              onClick={() =>
                setCurrent((prev) =>
                  prev === 0 ? images.length - 1 : prev - 1,
                )
              }
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white transition hover:bg-black/60"
            >
              <ChevronLeft className="size-4" />
            </button>
            <button
              type="button"
              onClick={() =>
                setCurrent((prev) =>
                  prev === images.length - 1 ? 0 : prev + 1,
                )
              }
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-1.5 text-white transition hover:bg-black/60"
            >
              <ChevronRight className="size-4" />
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
              onClick={() => setCurrent(index)}
              className={cn(
                "relative h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg border-2 transition",
                index === safeCurrent
                  ? "border-[#2d1649]"
                  : "border-transparent opacity-70 hover:opacity-100",
              )}
            >
              <Image
                src={img}
                alt={`${alt} ${index + 1}`}
                fill
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
