"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Sparkles, Star } from "lucide-react";
import { Link } from "@/i18n/navigation";

// Colors come from the --hero-* tokens in app/globals.css (#243).
export function Hero() {
  const t = useTranslations("landing.hero");

  return (
    <section className="mx-auto w-full max-w-[1346px] px-4 pt-6 pb-10 sm:px-10 sm:pt-[35px]">
      <div className="landing-hero grid items-center gap-8 overflow-hidden rounded-[2rem] border border-white/80 px-5 pt-8 pb-6 shadow-[var(--shadow-pop)] transition-shadow duration-300 hover:shadow-[var(--shadow-raised)] sm:px-10 sm:pt-12 lg:min-h-[525px] lg:grid-cols-2 lg:gap-16 lg:py-12 lg:pr-6 lg:pl-[70px]">
        <div className="landing-hero-copy flex min-w-0 flex-col items-center gap-3 text-center sm:gap-4">
          <h1
            className="font-extrabold tracking-tight text-balance text-hero-title"
            style={{ fontSize: "clamp(36px, 6vw, 88px)", lineHeight: "1" }}
          >
            {t("title1")}
          </h1>
          <p
            className="font-hero-accent font-semibold text-balance text-hero-accent"
            style={{ fontSize: "clamp(24px, 3.2vw, 46px)", lineHeight: "1.1" }}
          >
            {t("title2")}
          </p>
          <p className="max-w-[420px] text-base leading-snug font-light text-landing-ink sm:text-lg lg:text-xl">
            {t("subtitle")}
          </p>
          <Link
            href="/search"
            className="mt-2 inline-flex min-h-[52px] max-w-full items-center justify-center rounded-full bg-hero-accent px-10 py-3 text-center text-[19px] leading-tight font-bold text-white shadow-[0_10px_22px_rgb(171_58_117/22%)] transition-[transform,box-shadow,background-color] duration-200 hover:-translate-y-0.5 hover:bg-hero-accent-hover hover:shadow-[0_14px_28px_rgb(171_58_117/28%)] focus-visible:bg-hero-accent-hover focus-visible:ring-4 focus-visible:ring-hero-title focus-visible:ring-offset-2 focus-visible:ring-offset-hero-bg focus-visible:outline-none"
          >
            {t("cta")}
          </Link>
        </div>

        <div className="landing-hero-art relative flex min-w-0 justify-center lg:justify-end">
          <Star
            aria-hidden="true"
            className="fan-sparkle absolute top-[12%] left-[8%] size-7 fill-[#f2bd54] text-[#d89e35] drop-shadow-[0_4px_8px_rgb(216_158_53/25%)] sm:left-[12%]"
          />
          <Sparkles
            aria-hidden="true"
            className="fan-float absolute right-[7%] bottom-[13%] size-10 text-[#bd78bd] sm:right-[10%]"
            strokeWidth={1.4}
          />
          <Image
            src="/landing/bm-props-hero.webp"
            alt=""
            width={962}
            height={741}
            priority
            sizes="(min-width: 1346px) 640px, (min-width: 1024px) 48vw, 90vw"
            className="pointer-events-none h-auto w-full max-w-[420px] select-none sm:max-w-[520px] lg:max-w-[640px]"
          />
        </div>
      </div>
    </section>
  );
}
