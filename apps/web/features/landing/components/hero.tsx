"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { Link } from "@/i18n/navigation";

// Colors come from the --hero-* tokens in app/globals.css (#243).
export function Hero() {
  const t = useTranslations("landing.hero");

  return (
    <section className="mx-auto w-full max-w-[1440px] px-4 pt-5 pb-8 sm:px-8 sm:pt-8 sm:pb-12 lg:px-10">
      <div className="landing-hero-card relative isolate grid items-center gap-3 overflow-hidden rounded-[28px] px-6 pt-9 pb-2 sm:rounded-[36px] sm:px-10 sm:pt-12 lg:min-h-[550px] lg:grid-cols-[0.92fr_1.08fr] lg:gap-8 lg:px-16 lg:py-12">
        <div
          aria-hidden="true"
          className="landing-hero-orbit landing-hero-orbit-one"
        />
        <div
          aria-hidden="true"
          className="landing-hero-orbit landing-hero-orbit-two"
        />
        <div className="landing-hero-copy relative z-10 flex min-w-0 flex-col items-center gap-3 text-center sm:gap-4 lg:items-start lg:text-left">
          <span
            aria-hidden="true"
            className="mb-1 inline-flex size-10 items-center justify-center rounded-full border border-white/20 bg-white/10 text-[#f7b6e2] shadow-[0_0_28px_rgba(255,95,190,.24)]"
          >
            <Sparkles className="size-5" />
          </span>
          <h1
            className="max-w-[650px] font-extrabold tracking-[-0.055em] text-balance text-white drop-shadow-sm"
            style={{ fontSize: "clamp(40px, 6vw, 82px)", lineHeight: "0.98" }}
          >
            {t("title1")}
          </h1>
          <p
            className="font-hero-accent font-semibold tracking-[-0.035em] text-balance text-[#ffb5df]"
            style={{ fontSize: "clamp(25px, 3.2vw, 43px)", lineHeight: "1.08" }}
          >
            {t("title2")}
          </p>
          <p className="max-w-[440px] text-base leading-relaxed font-light text-white/75 sm:text-lg lg:text-xl">
            {t("subtitle")}
          </p>
          <Link
            href="/search"
            className="landing-hero-cta mt-3 inline-flex min-h-[54px] max-w-full items-center justify-center gap-2 rounded-full bg-[#ed4aa8] px-8 py-3 text-center text-base leading-tight font-bold text-white shadow-[0_12px_28px_rgba(237,74,168,.3)] transition-all hover:-translate-y-0.5 hover:bg-[#f15db2] hover:shadow-[0_16px_32px_rgba(237,74,168,.38)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:px-9 sm:text-lg"
          >
            {t("cta")}
            <ArrowUpRight aria-hidden="true" className="size-5" />
          </Link>
        </div>

        <div className="landing-hero-art relative mx-auto flex min-w-0 w-full max-w-[570px] justify-center lg:justify-end">
          <div aria-hidden="true" className="landing-hero-art-ring" />
          <Image
            src="/landing/bm-props-hero.webp"
            alt=""
            width={962}
            height={741}
            priority
            sizes="(min-width: 1346px) 640px, (min-width: 1024px) 48vw, 90vw"
            className="landing-hero-image pointer-events-none relative z-10 h-auto w-full max-w-[400px] select-none sm:max-w-[500px] lg:max-w-[590px]"
          />
          <span
            aria-hidden="true"
            className="landing-hero-star landing-hero-star-one"
          >
            ✦
          </span>
          <span
            aria-hidden="true"
            className="landing-hero-star landing-hero-star-two"
          >
            ✧
          </span>
        </div>
      </div>
    </section>
  );
}
