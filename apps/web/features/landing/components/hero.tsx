"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export function Hero() {
  const t = useTranslations("landing.hero");

  return (
    <>
      {/* Mobile — compact hero */}
      <div className="relative mx-auto h-[342px] w-full max-w-[358px] overflow-hidden rounded-[10px] bg-[#FEF3FF] sm:hidden">
        <div className="absolute inset-x-0 top-[21px] z-10 flex flex-col items-center pr-[25px] pl-[28px] text-center">
          <h1 className="-my-1.5 text-[clamp(20px,8.6vw,34px)] leading-[36px] font-bold tracking-tight whitespace-nowrap text-[#4C0566]">
            {t("title1")}
          </h1>
          <p className="text-[24px] leading-[32px] font-medium text-[#b0006d]">
            {t("title2")}
          </p>
        </div>
        <Image
          src="/landing/bm-props-sombra.png"
          alt=""
          width={1152}
          height={923}
          priority
          className="pointer-events-none absolute bottom-[30px] left-1/2 z-0 h-auto w-[92%] max-w-none select-none"
          style={{ transform: "translateX(-38%) rotate(-0.11deg)" }}
        />
        <div
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 h-[39px] rounded-b-[10px] bg-gradient-to-b from-[#FEF3FF] to-[#FFC2F8]"
        />
        <Link
          href="/search"
          className="absolute bottom-[24px] left-1/2 flex min-h-[26px] h-auto min-w-[128px] max-w-full -translate-x-1/2 items-center justify-center rounded-[10px] bg-[#b0006d] px-3 py-2 text-center text-[10px] leading-3 font-semibold text-white transition-colors hover:bg-[#8f0059]"
        >
          {t("cta")}
        </Link>
      </div>

      {/* Desktop — Figma Frame 93 hero */}
      <div className="mx-auto hidden max-w-[1346px] px-6 pt-[25px] pb-10 sm:block sm:px-10 sm:pt-[35px]">
        <div className="relative min-h-[460px] rounded-[10px] bg-[#FEF3FF] sm:min-h-[525px]">
          {/* Decorative art is clipped by its own wrapper, so the box can
              grow (min-h) without the outer overflow-hidden that used to
              crop the CTA/subtitle when the text ran tall (#165). */}
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[10px]">
            <Image
              src="/landing/bm-props-sombra.png"
              alt=""
              width={563}
              height={522}
              priority
              className="absolute top-0 right-[-60px] h-full w-auto max-w-none select-none object-contain"
              style={{ transform: "rotate(-0.11deg)" }}
            />
          </div>

          <div className="relative z-10 flex min-h-[460px] w-[849px] max-w-full flex-col items-center justify-center gap-4 px-6 pb-[115px] text-center sm:min-h-[525px] sm:px-[70px]">
            <h1
              className="font-bold text-[#4C0566] xl:whitespace-nowrap"
              style={{
                fontSize: "clamp(38px, 4.8vw, 78px)",
                lineHeight: "1.05",
              }}
            >
              {t("title1")}
            </h1>
            <p
              className="font-medium text-[#b0006d]"
              style={{
                fontSize: "clamp(24px, 3.6vw, 52px)",
                lineHeight: "1.05",
              }}
            >
              {t("title2")}
            </p>
            <p
              style={{ fontWeight: 300, fontSize: 20, lineHeight: "23px" }}
              className="max-w-[461px] text-center text-black"
            >
              {t("subtitle")}
            </p>
            <Link
              href="/search"
              className="flex min-h-[48px] h-auto min-w-[238px] max-w-full items-center justify-center rounded-[18.9px] bg-[#b0006d] px-6 py-3 text-center font-semibold text-white transition-colors hover:bg-[#8f0059]"
              style={{ fontSize: 18.6, lineHeight: "22px" }}
            >
              {t("cta")}
            </Link>
          </div>

          <div
            aria-hidden="true"
            className="absolute inset-x-0 bottom-0 z-0 h-[99px] rounded-b-[10px] bg-gradient-to-b from-[#FEF3FF] to-[#FFC2F8]"
          />
        </div>
      </div>
    </>
  );
}
