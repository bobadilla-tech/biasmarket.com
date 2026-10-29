"use client";

import Image from "next/image";
import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function AuthEditorialLayout({
  children,
  formSide,
  formLabel,
}: {
  children: ReactNode;
  formSide: "left" | "right";
  formLabel: string;
}) {
  const t = useTranslations("onboarding.login");
  const formOrder =
    formSide === "left" ? "order-1 lg:order-1" : "order-1 lg:order-2";
  const heroOrder =
    formSide === "left" ? "order-2 lg:order-2" : "order-2 lg:order-1";
  const columns =
    formSide === "left"
      ? "lg:grid-cols-[minmax(390px,440px)_minmax(0,1fr)]"
      : "lg:grid-cols-[minmax(0,1fr)_minmax(390px,440px)]";
  const benefits = [
    ["♧", "footerCurated", "footerCollectibles"],
    ["◎", "footerFanToFan", "footerCommunity"],
    ["◇", "footerThoughtful", "footerShopping"],
    ["✧", "footerGlobal", "footerFanCommunity"],
  ] as const;
  return (
    <div className="login-editorial relative isolate min-h-dvh overflow-x-clip text-[#211b37]">
      <header className="relative z-10 mx-auto flex max-w-[1440px] items-center justify-between px-5 py-5 sm:px-8 lg:px-12 lg:py-6">
        <Link href="/" className="flex flex-col">
          <span className="font-serif text-[1.7rem] font-semibold leading-none tracking-[-0.06em] text-[#171323] sm:text-3xl">
            BiasMarket
          </span>
          <span className="mt-1.5 text-[9px] font-medium tracking-[0.22em] text-[#625a7d] sm:text-[10px]">
            {t("marketplaceTagline")}
          </span>
        </Link>
        <nav
          aria-label={t("navigationLabel")}
          className="hidden items-center gap-8 text-sm font-medium text-[#332b4a] md:flex"
        >
          <Link className="login-nav-link" href="/search">
            {t("navShop")}
          </Link>
          <Link className="login-nav-link" href="/search?q=photocard">
            {t("navPhotocards")}
          </Link>
          <Link className="login-nav-link" href="/search?q=merch">
            {t("navMerch")}
          </Link>
          <Link className="login-nav-link" href="/contact">
            {t("navContact")}
          </Link>
        </nav>
        <div className="hidden items-center gap-3 text-right text-[10px] font-semibold leading-[1.55] tracking-[0.2em] text-[#40385d] lg:flex">
          <span aria-hidden="true" className="text-3xl text-[#8a61eb]">
            ✦
          </span>
          <span>
            {t("mottoCollect")}
            <br />
            {t("mottoConnect")}
            <br />
            {t("mottoBelong")}
          </span>
        </div>
      </header>
      <main
        className={`relative mx-auto grid w-full max-w-[1440px] grid-cols-1 items-center gap-7 px-5 pb-7 pt-2 sm:px-8 lg:min-h-[calc(100dvh-174px)] ${columns} lg:gap-10 lg:px-12 lg:pb-8 lg:pt-3`}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 overflow-hidden"
        >
          <div className="login-glow absolute -left-36 top-24 h-[30rem] w-[30rem] rounded-full" />
          <div className="login-glow login-glow-right absolute -right-36 top-24 h-[32rem] w-[32rem] rounded-full" />
          <span className="login-star login-star-one absolute left-[46%] top-[8%] text-4xl text-violet-500/80">
            ✦
          </span>
          <span className="login-star login-star-two absolute left-[6%] top-[58%] text-2xl text-[#a886ee]">
            ✧
          </span>
          <span className="login-star login-star-three absolute right-[4%] top-[65%] text-3xl text-[#d98acb]">
            ✧
          </span>
        </div>
        <section
          className={`relative z-[1] flex min-w-0 flex-col justify-center ${heroOrder} lg:min-h-[500px]`}
        >
          <div className="max-w-[650px]">
            <p className="mb-3 text-[10px] font-semibold tracking-[0.28em] text-[#71658f] sm:text-xs">
              {t("heroEyebrow")}
            </p>
            <h1 className="max-w-[620px] font-serif text-[clamp(2.8rem,5.6vw,5rem)] leading-[0.94] tracking-[-0.055em] text-[#171323]">
              {t("heroTitleFirst")}
              <br />
              {t("heroTitleSecond")}
              <span className="ml-2 inline-block text-[0.55em] text-[#8e61e8]">
                ✦
              </span>
            </h1>
            <p className="mt-4 max-w-[490px] text-base leading-relaxed text-[#423a5c] sm:text-lg">
              {t("heroDescription")}
            </p>
            <div className="mt-5 hidden items-start gap-5 border-l border-[#9885c5] pl-4 text-[10px] font-medium leading-[1.8] tracking-[0.2em] text-[#51466e] sm:flex">
              <span>
                {t("categoryPhotocards")}
                <br />
                {t("categoryAlbums")}
                <br />
                {t("categoryApparel")}
              </span>
              <span aria-hidden="true" className="text-[#9c8cb8]">
                ✧
              </span>
              <span>
                {t("categoryCollectibles")}
                <br />
                {t("categoryAndMore")}
              </span>
            </div>
          </div>
          <div className="relative mt-5 hidden h-[226px] max-w-[650px] sm:block lg:mt-1 lg:h-[244px]">
            <div className="login-photocard login-photocard-one absolute bottom-5 left-[4%] h-[178px] w-[134px] -rotate-[13deg] rounded-[19px] border border-white/90 bg-white/40 p-2 shadow-[0_22px_55px_rgba(70,45,130,0.20)] backdrop-blur-sm lg:left-[7%] lg:h-[196px] lg:w-[148px]">
              <div className="relative h-full overflow-hidden rounded-[14px] border border-white/80 bg-gradient-to-br from-[#bed1f5] via-[#e7b9e5] to-[#f8e2cf]">
                <Image
                  src="/landing/photocard.png"
                  alt={t("photocardImageAlt")}
                  fill
                  sizes="148px"
                  className="object-cover opacity-90 mix-blend-multiply"
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-[#8e7ce7]/25 via-transparent to-white/55" />
                <span className="absolute bottom-3 left-3 rounded-full border border-white/80 bg-white/50 px-2 py-1 text-[8px] tracking-[0.18em] text-[#44375f] backdrop-blur">
                  {t("collectMoments")}
                </span>
              </div>
            </div>
            <div className="login-photocard login-photocard-two absolute bottom-2 left-[31%] h-[194px] w-[145px] rotate-[8deg] rounded-[19px] border border-white/90 bg-white/45 p-2 shadow-[0_25px_60px_rgba(70,45,130,0.20)] backdrop-blur-sm lg:left-[34%] lg:h-[218px] lg:w-[164px]">
              <div className="relative h-full overflow-hidden rounded-[14px] bg-gradient-to-br from-[#f8d7e7] via-[#c8c7f6] to-[#a8dce2]">
                <Image
                  src="/landing/album.png"
                  alt={t("albumImageAlt")}
                  fill
                  sizes="164px"
                  className="object-cover opacity-80 mix-blend-multiply"
                />
                <div className="absolute inset-0 bg-gradient-to-tr from-[#a081ee]/25 via-transparent to-white/45" />
              </div>
            </div>
            <div className="login-photocard login-photocard-three absolute bottom-8 left-[62%] hidden h-[136px] w-[104px] -rotate-[8deg] rounded-[17px] border border-white/90 bg-white/45 p-1.5 shadow-[0_20px_45px_rgba(70,45,130,0.16)] backdrop-blur-sm lg:block">
              <div className="relative h-full overflow-hidden rounded-[12px]">
                <Image
                  src="/landing/sticker.png"
                  alt={t("starImageAlt")}
                  fill
                  sizes="104px"
                  className="object-cover opacity-75 mix-blend-multiply"
                />
              </div>
            </div>
          </div>
        </section>
        <section
          aria-label={formLabel}
          className={`relative z-[1] mx-auto w-full max-w-[440px] min-w-0 ${formOrder}`}
        >
          {children}
        </section>
      </main>
      <footer className="relative z-[1] mx-auto mt-1 grid max-w-[1344px] grid-cols-2 items-center gap-y-4 border-t border-[#796aa3]/30 px-5 py-5 text-[#322a49] sm:grid-cols-4 sm:px-8 lg:px-0">
        {benefits.map(([icon, title, sub], i) => (
          <div
            key={icon}
            className={`flex items-center gap-2 px-2 sm:gap-3 sm:px-4 ${i % 2 === 0 ? "border-r border-[#796aa3]/40" : ""} ${i === 1 ? "sm:border-r sm:border-[#796aa3]/40" : ""}`}
          >
            <span aria-hidden="true" className="text-xl sm:text-2xl">
              {icon}
            </span>
            <span className="text-[8px] font-semibold leading-relaxed tracking-[0.1em] sm:text-[9px] sm:tracking-[0.12em]">
              {t(title)}
              <br />
              {t(sub)}
            </span>
          </div>
        ))}
      </footer>
    </div>
  );
}
