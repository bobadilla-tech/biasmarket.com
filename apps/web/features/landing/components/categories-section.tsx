"use client";

import { useRef } from "react";
import Image from "next/image";
import { CircleArrowLeft, CircleArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const CATEGORY_IMAGES: Record<
  string,
  { src: string; width: number; height: number }
> = {
  photocards: { src: "/landing/photocard.png", width: 86, height: 87 },
  albums: { src: "/landing/album.png", width: 93, height: 95 },
  lightsticks: { src: "/landing/wand.png", width: 84, height: 104 },
  concert: { src: "/landing/magazine.png", width: 104, height: 82 },
  magazine: { src: "/landing/dazed.png", width: 104, height: 82 },
  otros: { src: "/landing/box.png", width: 104, height: 94 },
};

function MobileCategoryCarousel({
  items,
}: {
  items: { key: string; name: string }[];
}) {
  const t = useTranslations("landing.categories");
  const scrollerRef = useRef<HTMLDivElement>(null);

  const scrollByCards = (direction: -1 | 1) => {
    scrollerRef.current?.scrollBy({
      left: direction * 240,
      behavior: "smooth",
    });
  };

  return (
    <div className="lg:hidden">
      <h2 className="text-[21px] leading-[26px] font-bold text-black">
        {t("title")}
      </h2>
      <div
        ref={scrollerRef}
        className="no-scrollbar mt-3 flex snap-x snap-mandatory gap-2 overflow-x-auto"
      >
        {items.map(({ key, name }, index) => {
          const img = CATEGORY_IMAGES[key] ?? CATEGORY_IMAGES.otros;
          return (
            <Link
              key={key}
              href={`/search?category=${encodeURIComponent(name)}`}
              className={`flex min-h-[106px] h-auto w-[106px] shrink-0 snap-start flex-col items-center justify-between rounded-[10px] pt-3 pb-1.5 ${
                index % 2 === 0 ? "bg-[#F5EAFF]" : "bg-[#FFEAF6]"
              }`}
            >
              <Image
                src={img.src}
                alt={name}
                width={img.width}
                height={img.height}
                className="h-[52px] w-auto object-contain"
              />
              <span className="max-w-full px-2 text-center text-[13px] leading-4 font-medium break-words text-black">
                {name}
              </span>
            </Link>
          );
        })}
      </div>
      <div className="mt-2 flex justify-end gap-0">
        <button
          type="button"
          aria-label={t("title")}
          onClick={() => scrollByCards(-1)}
          className="p-0.5 text-[#1C1B1F] transition-opacity hover:opacity-70"
        >
          <CircleArrowLeft className="size-6" strokeWidth={1.5} />
        </button>
        <button
          type="button"
          aria-label={t("title")}
          onClick={() => scrollByCards(1)}
          className="p-0.5 text-[#1C1B1F] transition-opacity hover:opacity-70"
        >
          <CircleArrowRight className="size-6" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

export function CategoriesSection() {
  const t = useTranslations("landing.categories");
  const items = t.raw("items") as { key: string; name: string }[];

  return (
    <section
      id="categorias"
      className="mx-auto max-w-7xl scroll-mt-28 px-6 py-8 sm:px-10 sm:py-14"
    >
      <MobileCategoryCarousel items={items} />

      <div className="hidden lg:block">
        <h2 className="text-[32px] leading-[39px] font-bold text-black">
          {t("title")}
        </h2>

        <div className="mt-6 flex items-center justify-between gap-[15px]">
          {items.map(({ key, name }, index) => {
            const img = CATEGORY_IMAGES[key] ?? CATEGORY_IMAGES.otros;
            const { width, height } = img;
            return (
              <Link
                key={key}
                href={`/search?category=${encodeURIComponent(name)}`}
                className="flex min-h-[185px] h-auto flex-1 flex-col items-center justify-between rounded-[10px] px-2 pt-[30px] pb-[16px] transition hover:shadow-md"
                style={{
                  background: index % 2 === 0 ? "#F5EAFF" : "#FFEAF6",
                }}
              >
                <Image
                  src={img.src}
                  alt={name}
                  width={width}
                  height={height}
                  className="mx-auto h-[96px] w-auto max-w-full object-contain"
                />
                <span className="max-w-full px-2 text-center text-[20px] leading-[24px] font-medium break-words text-black">
                  {name}
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </section>
  );
}
