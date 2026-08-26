"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";

function Badge({ label }: { label: string }) {
  return (
    <span className="inline-flex h-6 w-[70px] items-center justify-center rounded-[10px] bg-[#A64AE9] text-[13px] font-medium text-white">
      {label}
    </span>
  );
}

function HeroBanner() {
  const t = useTranslations("landing.hero");

  return (
    <>
      <div className="relative mx-auto h-[342px] w-full max-w-[358px] overflow-hidden rounded-[10px] bg-[#FEF3FF] sm:hidden">
        <div className="absolute inset-x-0 top-[21px] z-10 flex flex-col items-center pr-[25px] pl-[28px] text-center">
          <h1 className="-my-1.5 text-[clamp(20px,8.6vw,34px)] leading-[36px] font-bold tracking-tight whitespace-nowrap text-[#4C0566]">
            {t("title1")}
          </h1>
          <p className="text-[24px] leading-[32px] font-medium text-[#FC17A0]">
            {t("title2")}
          </p>
        </div>
        <Image
          src="/landing/bm-props-sombra.png"
          alt=""
          width={1152}
          height={923}
          priority
          className="pointer-events-none absolute inset-x-0 bottom-[14px] z-0 mx-auto w-full max-w-none select-none"
          style={{ transform: "rotate(-0.11deg)" }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-[39px] rounded-b-[10px] bg-gradient-to-b from-[#FEF3FF] to-[#FFC2F8]"
        />
        <Link
          href="/search"
          className="absolute bottom-[24px] left-1/2 flex h-[26px] w-[128px] -translate-x-1/2 items-center justify-center rounded-[10px] bg-[#FC17A0] text-[10px] leading-3 font-semibold text-white transition-colors hover:bg-[#e0128d]"
        >
          {t("cta")}
        </Link>
      </div>

      {/* Tablet/desktop — existing banner */}
      <div
        style={{
          background:
            "linear-gradient(114.27deg, #FFFFFF 4.68%, #EDDAFF 31.56%, #FFD7EB 89.06%)",
        }}
        className="relative hidden min-h-[460px] overflow-hidden rounded-[10px] sm:block sm:min-h-[525px]"
      >
        <div className="relative z-10 flex h-full w-[488px] max-w-full flex-col justify-center gap-7 pr-4 pl-5 sm:gap-[42px] sm:pr-4 sm:pl-[55.5px]">
          <h1 className="text-balance text-[30px] leading-[38px] font-extrabold sm:text-[48px] sm:leading-[58px]">
            <span className="text-[#170A14]">{t("title1")}</span>
            <br />
            <span className="text-[#FF3DB1]">{t("title2")}</span>
          </h1>
          <p
            style={{
              fontWeight: 400,
              fontSize: 16,
              lineHeight: "19px",
              letterSpacing: "0%",
            }}
            className="max-w-[381px] text-black"
          >
            {t("subtitle")}
          </p>
          <Link
            href="/search"
            className={buttonVariants({
              size: "lg",
              className: "w-fit rounded-[10px] px-8 text-[20px] font-medium",
            })}
          >
            {t("cta")}
          </Link>
        </div>
        <Image
          src="/landing/wand.png"
          alt=""
          width={346}
          height={429}
          className="pointer-events-none absolute top-[43px] right-0 hidden w-[346px] h-[429px] select-none object-contain sm:block"
        />
      </div>
    </>
  );
}

function HeroSideCards() {
  const t = useTranslations("landing.hero");

  return (
    <div className="hidden flex-col gap-4 sm:flex sm:gap-6">
      <div
        style={{
          background:
            "linear-gradient(90.61deg, #EADAFF 0.59%, #E0BEFF 50.08%, #CDA7FF 99.57%)",
        }}
        className="relative flex h-[257px] flex-col overflow-hidden rounded-[10px] px-5 py-7 sm:px-10 sm:py-8"
      >
        <Badge label={t("releasesBadge")} />
        <h2 className="mt-3 text-[24px] leading-[29px] font-semibold text-black">
          {t("releasesTitle")}
        </h2>
        <p className="mt-2 max-w-[16rem] text-[13px] leading-4 text-black">
          {t("releasesSubtitle")}
        </p>
        <Link
          href="/search"
          className="mt-5 inline-flex items-center gap-1 self-start text-[13px] leading-4 font-medium text-[#933BE7] underline-offset-4 transition-all hover:underline sm:mt-6"
        >
          {t("releasesCta")} →
        </Link>
        <Image
          src="/landing/bag.png"
          alt=""
          width={228}
          height={228}
          className="pointer-events-none absolute top-[22px] right-0 hidden w-[228px] select-none object-contain sm:block"
        />
      </div>

      <div
        style={{
          background:
            "linear-gradient(89.6deg, #E2DEFF 1.73%, #D7CFF9 50.68%, #B6A3FB 99.63%)",
        }}
        className="relative flex h-[257px] flex-col overflow-hidden rounded-[10px] px-5 py-7 sm:px-10 sm:py-8"
      >
        <Badge label={t("blogBadge")} />
        <h2 className="mt-3 text-[24px] leading-[29px] font-semibold text-black">
          {t("blogTitle")}
        </h2>
        <p className="mt-2 max-w-[16rem] text-[13px] leading-4 text-black">
          {t("blogSubtitle")}
        </p>
        <Link
          href="/search"
          className="mt-5 inline-flex items-center gap-1 self-start text-[13px] leading-4 font-medium text-[#933BE7] underline-offset-4 transition-all hover:underline sm:mt-6"
        >
          {t("blogCta")} →
        </Link>
        <Image
          src="/landing/sticker.png"
          alt=""
          width={251}
          height={222}
          className="pointer-events-none absolute top-[26px] right-0 hidden w-[251px] select-none object-contain sm:block"
        />
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="mx-auto max-w-7xl px-6 pt-6 pb-8 sm:px-10 sm:py-10">
      <div className="grid gap-4 sm:gap-6 lg:grid-cols-[1.62fr_1fr]">
        <HeroBanner />
        <HeroSideCards />
      </div>
    </section>
  );
}
