"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

interface AboutItem {
  title: string;
  body: string;
}

const ILLUSTRATIONS = [
  { src: "/landing/people.png", alt: "" },
  { src: "/landing/store.png", alt: "" },
  { src: "/landing/shield.png", alt: "" },
  { src: "/landing/box.png", alt: "" },
];

export function AboutSection() {
  const t = useTranslations("landing.about");
  const items = t.raw("items") as AboutItem[];

  return (
    <section className="mx-auto max-w-7xl px-4 py-10 sm:px-10 sm:py-14">
      <h2 className="text-center text-3xl font-medium sm:text-5xl">
        {t("title")}
      </h2>
      <p className="mt-3 text-center text-lg font-medium sm:mt-4 sm:text-2xl">
        {t("subtitle")}
      </p>

      <div className="mt-8 grid grid-cols-2 gap-6 sm:mt-10 sm:gap-8 md:grid-cols-4">
        {ILLUSTRATIONS.map(({ src, alt }) => (
          <div key={src} className="flex items-center justify-center">
            <Image
              src={src}
              alt={alt}
              width={360}
              height={300}
              className="h-28 w-auto object-contain sm:h-40 lg:h-52"
            />
          </div>
        ))}
      </div>

      <div className="mt-10 grid gap-8 sm:mt-12 sm:gap-10 md:grid-cols-3">
        {items.map((item) => (
          <div key={item.title} className="text-center md:text-left">
            <h3 className="text-lg font-medium sm:text-2xl">{item.title}</h3>
            <p className="mt-3 text-justify text-base font-light leading-relaxed sm:text-lg">
              {item.body}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-12 flex flex-col items-center gap-5 sm:mt-14 sm:gap-6">
        <p className="text-center text-lg font-medium sm:text-2xl">
          {t("helpTitle")}
        </p>
        <Link
          href="/contact"
          className={buttonVariants({
            variant: "outline",
            className:
              "h-14 w-full rounded-[10px] border-0 bg-landing-gray px-12 text-lg text-foreground hover:bg-landing-gray/80 sm:h-[63px] sm:w-auto sm:text-xl",
          })}
        >
          {t("helpCta")}
        </Link>
      </div>
    </section>
  );
}
