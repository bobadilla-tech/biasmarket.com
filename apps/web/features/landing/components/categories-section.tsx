"use client";

import Image from "next/image";
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

export function CategoriesSection() {
  const t = useTranslations("landing.categories");
  const items = t.raw("items") as { key: string; name: string }[];

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-10 sm:py-14">
      <SectionHeading title={t("title")} />

      <div className="mt-6 grid gap-5 sm:mt-8 sm:gap-8 lg:grid-cols-[1fr_1.15fr]">
        <CategoriesBanner />

        <div className="grid grid-cols-2 gap-3">
          {items.map(({ key, name }) => (
            <CategoryCard key={key} item={{ key, name }} />
          ))}
        </div>
      </div>
    </section>
  );
}
