"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

export function Hero() {
  const t = useTranslations("landing.hero");

  return (
    <section className="mx-auto max-w-7xl px-4 py-6 sm:px-10 sm:py-10">
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[1.62fr_1fr]">
        <div className="relative overflow-hidden rounded-[10px] bg-landing-pink px-5 py-10 sm:px-12 sm:py-12 lg:min-h-[525px]">
          <div className="relative z-10 flex max-w-md flex-col items-start gap-5 sm:gap-6">
            <h1 className="text-3xl font-medium leading-tight text-balance text-landing-title sm:text-4xl lg:text-5xl">
              {t("title")}
            </h1>
            <p className="text-base text-foreground sm:text-lg lg:text-xl">
              {t("subtitle")}
            </p>
            <Link
              href="/search"
              className={buttonVariants({
                size: "lg",
                className:
                  "h-[53px] w-full rounded-[10px] px-8 text-lg sm:w-auto sm:text-xl",
              })}
            >
              {t("cta")}
            </Link>
          </div>
          <Image
            src="/landing/wand.png"
            alt=""
            width={292}
            height={363}
            className="pointer-events-none absolute right-4 bottom-0 hidden h-auto w-56 select-none object-contain sm:block lg:w-72"
          />
        </div>

        <div className="flex flex-col gap-4 sm:gap-6">
          <div className="relative overflow-hidden rounded-[10px] bg-landing-violet px-5 py-7 sm:px-10 sm:py-8">
            <h2 className="text-xl font-medium sm:text-3xl">
              {t("releasesTitle")}
            </h2>
            <p className="mt-2 max-w-[16rem] text-sm text-foreground/90 sm:text-base lg:text-lg">
              {t("releasesSubtitle")}
            </p>
            <Link
              href="/search"
              className="mt-5 inline-flex items-center gap-1 self-start text-sm font-medium text-brand-pink underline-offset-4 transition-all hover:underline sm:mt-6 sm:text-base"
            >
              {t("releasesCta")}
            </Link>
            <Image
              src="/landing/bag.png"
              alt=""
              width={222}
              height={222}
              className="pointer-events-none absolute -right-2 bottom-0 hidden h-40 w-auto object-contain sm:block"
            />
          </div>

          <div className="relative flex-1 overflow-hidden rounded-[10px] bg-landing-purple px-5 py-7 sm:px-10 sm:py-8">
            <h2 className="text-xl font-medium sm:text-3xl">
              {t("blogTitle")}
            </h2>
            <p className="mt-2 max-w-[16rem] text-sm text-foreground/90 sm:text-base lg:text-lg">
              {t("blogSubtitle")}
            </p>
            <Link
              href="/blog"
              className="mt-5 inline-flex items-center gap-1 self-start text-sm font-medium text-brand-pink underline-offset-4 transition-all hover:underline sm:mt-6 sm:text-base"
            >
              {t("blogCta")}
            </Link>
            <Image
              src="/landing/sticker.png"
              alt=""
              width={251}
              height={222}
              className="pointer-events-none absolute right-0 bottom-0 hidden h-40 w-auto object-contain sm:block"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
