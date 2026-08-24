"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

interface AboutItem {
  title: string;
  body: string;
}

const ILLUSTRATIONS = [
  { src: "/landing/people.png", alt: "", width: 268, height: 148 },
  { src: "/landing/store.png", alt: "", width: 224, height: 153 },
  { src: "/landing/shield.png", alt: "", width: 258, height: 173 },
];

/* Mobile — Figma Frame 32: intro row with wand art, three white feature cards,
   ✦ divider, then the help-center CTA. */
function MobileAbout({
  title,
  subtitle,
  helpTitle,
  helpCta,
  items,
}: {
  title: string;
  subtitle: string;
  helpTitle: string;
  helpCta: string;
  items: AboutItem[];
}) {
  return (
    <div className="bg-[#FFEAF6] px-6 py-8 sm:hidden">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[22px] leading-[26px] font-bold text-black">
            {title}
          </h2>
          <p className="mt-1.5 text-[11px] leading-[14px] text-black">
            {subtitle}
          </p>
        </div>
        <Image
          src="/landing/wand.png"
          alt=""
          width={84}
          height={104}
          className="pointer-events-none h-auto w-[72px] shrink-0 select-none object-contain"
        />
      </div>

      <div className="mt-5 flex flex-col gap-3">
        {items.map((item, index) => (
          <div
            key={item.title}
            className="flex flex-col gap-1 rounded-[20px] bg-white p-4"
          >
            <Image
              src={ILLUSTRATIONS[index]?.src ?? ILLUSTRATIONS[0].src}
              alt=""
              width={ILLUSTRATIONS[index]?.width ?? 48}
              height={ILLUSTRATIONS[index]?.height ?? 48}
              className="h-11 w-auto object-contain"
            />
            <h3 className="mt-1 text-sm leading-[17px] font-semibold text-black">
              {item.title}
            </h3>
            <p className="text-justify text-[11px] leading-[14px] font-light text-black">
              {item.body}
            </p>
          </div>
        ))}
      </div>

      <div aria-hidden="true" className="mt-6 flex items-center gap-2">
        <span className="h-px flex-1 border-t border-white" />
        <span className="text-lg leading-none font-bold text-white">✦</span>
        <span className="h-px flex-1 border-t border-white" />
      </div>

      <p className="mt-4 text-center text-[11px] leading-[13px] text-black">
        {helpTitle}
      </p>
      <div className="mt-3 flex justify-center">
        <Link
          href="/contact"
          className="flex h-[38px] items-center justify-center rounded-[8px] bg-[#FC17A0] px-5 text-xs font-medium text-white transition-colors hover:bg-[#e0128d]"
        >
          {helpCta}
        </Link>
      </div>
    </div>
  );
}

export function AboutSection() {
  const t = useTranslations("landing.about");
  const items = t.raw("items") as AboutItem[];

  return (
    <>
      <MobileAbout
        title={t("title")}
        subtitle={t("subtitle")}
        helpTitle={t("helpTitle")}
        helpCta={t("helpCta")}
        items={items}
      />

      <section className="hidden w-full bg-[#FFEAF6] sm:block">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-10">
          <h2
            style={{ fontWeight: 600, fontSize: 36, lineHeight: "44px" }}
            className="text-center text-black"
          >
            {t("title")}
          </h2>
          <p
            style={{ fontWeight: 400, fontSize: 16, lineHeight: "19px" }}
            className="mt-4 text-center text-black"
          >
            {t("subtitle")}
          </p>

          <div className="mx-auto mt-8 grid w-fit grid-cols-2 items-center justify-items-center gap-6 sm:mt-10 sm:flex sm:gap-12 lg:gap-24">
            {ILLUSTRATIONS.map(({ src, alt, width, height }, index) => (
              <Image
                key={src}
                src={src}
                alt={alt}
                width={width}
                height={height}
                className={
                  index === ILLUSTRATIONS.length - 1
                    ? "h-auto w-32 object-contain sm:w-auto col-span-2 sm:col-span-1"
                    : "h-auto w-32 object-contain sm:w-auto"
                }
              />
            ))}
          </div>

          <div className="mt-0 grid gap-8 sm:mt-0 sm:gap-10 md:grid-cols-3">
            {items.map((item) => (
              <div
                key={item.title}
                className="flex flex-col items-center gap-[15px] text-center"
              >
                <h3
                  style={{ fontWeight: 600, fontSize: 20, lineHeight: "24px" }}
                  className="text-black"
                >
                  {item.title}
                </h3>
                <p
                  style={{
                    fontWeight: 300,
                    fontSize: 14,
                    lineHeight: "17px",
                    textAlign: "justify",
                  }}
                  className="text-black"
                >
                  {item.body}
                </p>
              </div>
            ))}
          </div>

          <div className="mt-10 flex flex-col items-center gap-3 text-center sm:mt-12">
            <p
              style={{ fontWeight: 400, fontSize: 20, lineHeight: "24px" }}
              className="text-black"
            >
              {t("helpTitle")}
            </p>
            <Link
              href="#faq"
              style={{ fontWeight: 500, fontSize: 16, lineHeight: "19px" }}
              className="flex h-[59px] w-[287px] items-center justify-center rounded-[8.5px] bg-[#D9D9D9] text-black transition-colors hover:bg-[#c9c9c9]"
            >
              {t("helpCta")}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
