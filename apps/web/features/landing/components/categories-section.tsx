"use client";

import { useRef } from "react";
import Image from "next/image";
import { CircleArrowLeft, CircleArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SectionHeading } from "./section-heading";

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

function CategoriesBanner() {
  const t = useTranslations("landing.categories");

  return (
    <div
      style={{
        background:
          "linear-gradient(114.26deg, #FFEEFA 16.34%, #FEE2F6 41.95%, #F1E4EF 52.63%, #FFDBFB 73.33%, #E9D1E7 94.02%)",
      }}
      className="relative h-[300px] overflow-hidden rounded-[20px] sm:h-[360px]"
    >
      <h3 className="absolute top-[56px] left-5 z-10 max-w-[283px] text-[30px] leading-[36px] font-bold sm:top-[64px] sm:left-[40px] sm:text-[48px] sm:leading-[58px]">
        <span className="text-[#FF3DB1]">{t("heading1")}</span>
        <br />
        <span className="text-black">{t("heading2")}</span>
      </h3>
      <p
        style={{ fontWeight: 400, fontSize: 13, lineHeight: "16px" }}
        className="absolute top-[150px] left-5 z-10 w-[237px] text-black sm:top-[190px] sm:left-[40px]"
      >
        {t("subtitle")}
      </p>
      <Link
        href="/search"
        style={{ fontWeight: 500, fontSize: 20, lineHeight: "24px" }}
        className="absolute top-[196px] left-5 z-10 flex h-[41px] w-[154px] items-center justify-center rounded-[10px] border border-[#FF3DB1] text-[#FF3DB1] transition-colors hover:bg-[#FF3DB1] hover:text-white sm:top-[234px] sm:left-[40px]"
      >
        {t("explore")}
      </Link>
      <Image
        src="/landing/cart.png"
        alt=""
        width={305}
        height={368}
        className="pointer-events-none absolute top-[-8px] right-0 hidden w-[305px] select-none object-contain sm:block"
      />
    </div>
  );
}

function CategoryCard({ item }: { item: { key: string; name: string } }) {
  const img = CATEGORY_IMAGES[item.key] ?? CATEGORY_IMAGES.otros;

  return (
    <Link
      href={`/search?category=${encodeURIComponent(item.name)}`}
      className="group flex items-center gap-2 overflow-hidden rounded-[10px] border border-landing-graphite bg-white px-2.5 py-2.5 transition hover:shadow-md sm:gap-4 sm:px-4 sm:py-4"
    >
      <Image
        src={img.src}
        alt={item.name}
        width={img.width}
        height={img.height}
        className="h-10 w-10 shrink-0 object-contain sm:h-20 sm:w-20"
      />
      <span className="min-w-0 text-lg leading-tight font-semibold text-black break-words sm:text-2xl">
        {item.name}
      </span>
    </Link>
  );
}

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
              className={`flex h-[106px] w-[106px] shrink-0 snap-start flex-col items-center justify-between rounded-[10px] pt-3 pb-1.5 ${
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
              <span className="text-[13px] leading-4 font-medium text-black">
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
        <SectionHeading title={t("title")} />

        <div className="mt-6 grid gap-5 sm:mt-8 sm:gap-8 lg:grid-cols-[1fr_1.15fr]">
          <CategoriesBanner />

          <div className="grid grid-cols-2 gap-3">
            {items.map(({ key, name }) => (
              <CategoryCard key={key} item={{ key, name }} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
