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

export function CategoriesSection() {
  const t = useTranslations("landing.categories");
  const items = t.raw("items") as { key: string; name: string }[];

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-10 sm:py-14">
      <SectionHeading title={t("title")} />

      <div className="mt-6 grid gap-5 sm:mt-8 sm:gap-8 lg:grid-cols-[1fr_1.15fr]">
        <div
          style={{
            background:
              "linear-gradient(114.26deg, #FFEEFA 16.34%, #FEE2F6 41.95%, #F1E4EF 52.63%, #FFDBFB 73.33%, #E9D1E7 94.02%)",
          }}
          className="relative h-[360px] overflow-hidden rounded-[20px]"
        >
          <h3
            style={{ fontWeight: 700, fontSize: 48, lineHeight: "58px" }}
            className="absolute top-[64px] left-[40px] max-w-[283px]"
          >
            <span className="text-[#FF3DB1]">{t("heading1")}</span>
            <br />
            <span className="text-black">{t("heading2")}</span>
          </h3>
          <p
            style={{ fontWeight: 400, fontSize: 13, lineHeight: "16px" }}
            className="absolute top-[190px] left-[40px] w-[237px] text-black"
          >
            {t("subtitle")}
          </p>
          <Link
            href="/search"
            style={{ fontWeight: 500, fontSize: 20, lineHeight: "24px" }}
            className="absolute top-[234px] left-[40px] flex h-[41px] w-[154px] items-center justify-center rounded-[10px] border border-[#FF3DB1] text-[#FF3DB1] transition-colors hover:bg-[#FF3DB1] hover:text-white"
          >
            {t("explore")}
          </Link>
          <Image
            src="/landing/cart.png"
            alt=""
            width={305}
            height={368}
            className="pointer-events-none absolute top-[-8px] left-[260px] w-[305px] select-none object-contain"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {items.map(({ key, name }) => {
            const img = CATEGORY_IMAGES[key] ?? CATEGORY_IMAGES.otros;
            return (
              <Link
                key={key}
                href={`/search?category=${encodeURIComponent(name)}`}
                className="group flex items-center gap-3 overflow-hidden rounded-[10px] border border-landing-graphite bg-white px-3 py-3 transition hover:shadow-md sm:gap-4 sm:px-4 sm:py-4"
              >
                <Image
                  src={img.src}
                  alt={name}
                  width={img.width}
                  height={img.height}
                  className="h-12 w-12 shrink-0 object-contain sm:h-20 sm:w-20"
                />
                <span className="min-w-0 text-2xl leading-tight font-semibold text-black break-words">
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
