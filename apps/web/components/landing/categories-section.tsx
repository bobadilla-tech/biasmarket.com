"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const CATEGORY_IMAGES: Record<string, string> = {
  photocards: "/landing/photocard.png",
  albums: "/landing/album.png",
  lightsticks: "/landing/wand.png",
  photobook: "/landing/dazed.png",
  magazine: "/landing/dazed.png",
  otros: "/landing/box.png",
};

export function CategoriesSection() {
  const t = useTranslations("landing.categories");
  const items = t.raw("items") as { key: string; name: string }[];

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-10 sm:py-14">
      <h2 className="text-center text-3xl font-medium sm:text-5xl">
        {t("title")}
      </h2>

      <div className="mt-6 grid gap-5 sm:mt-8 sm:gap-8 lg:grid-cols-[1fr_1.15fr]">
        <div className="relative overflow-hidden rounded-[20px] bg-landing-blush px-6 py-8 sm:px-8 sm:py-10">
          <h3 className="max-w-[20rem] text-2xl font-medium text-brand-pink sm:text-4xl">
            {t("heading")}
          </h3>
          <p className="mt-3 max-w-xs text-base text-foreground sm:mt-4 sm:text-lg">
            {t("subtitle")}
          </p>
          <Link
            href="/search"
            className="mt-6 inline-block text-base font-medium text-landing-link hover:underline sm:mt-8 sm:text-lg"
          >
            {t("explore")}
          </Link>
          <Image
            src="/landing/cart.png"
            alt=""
            width={347}
            height={419}
            className="pointer-events-none absolute right-0 bottom-0 hidden h-64 w-auto object-contain sm:block lg:h-80"
          />
        </div>

        <div className="grid grid-cols-2 gap-3 sm:gap-6">
          {items.map(({ key, name }) => (
            <Link
              key={key}
              href={`/search?q=${encodeURIComponent(name)}`}
              className="group flex items-center gap-3 overflow-hidden rounded-[10px] border border-landing-graphite bg-white px-3 py-4 transition hover:shadow-md sm:gap-4 sm:px-4 sm:py-6"
            >
              <Image
                src={CATEGORY_IMAGES[key] ?? CATEGORY_IMAGES.otros}
                alt={name}
                width={122}
                height={125}
                className="h-12 w-12 shrink-0 object-contain sm:h-24 sm:w-24"
              />
              <span className="min-w-0 text-lg leading-tight font-medium text-foreground break-words sm:text-3xl">
                {name}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
