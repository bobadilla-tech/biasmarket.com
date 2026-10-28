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

const BRAND = "BIASMARKET";

/** Renders the title with the brand name wrapped in the brand gradient. */
function BrandTitle({ title }: { title: string }) {
  const index = title.indexOf(BRAND);
  if (index === -1) return <>{title}</>;
  return (
    <>
      {title.slice(0, index)}
      <span
        className="bg-clip-text text-transparent"
        style={{
          backgroundImage:
            "linear-gradient(90deg, var(--brand-gradient-start) 0%, var(--brand-gradient-end) 100%)",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
        }}
      >
        {BRAND}
      </span>
      {title.slice(index + BRAND.length)}
    </>
  );
}

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
    <div className="flex flex-col bg-landing-rose p-[25px] sm:hidden">
      <div className="flex w-full items-start justify-between gap-5">
        <div className="min-w-0">
          <h2 className="text-[21px] leading-[25px] font-bold text-black">
            {title.includes("BIASMARKET") ? (
              <>
                {title.split("BIASMARKET")[0]}
                <span
                  className="bg-clip-text text-transparent"
                  style={{
                    backgroundImage:
                      "linear-gradient(90deg, var(--brand-pink) 0%, var(--brand-violet) 100%)",
                  }}
                >
                  BIASMARKET
                </span>
                {title.split("BIASMARKET")[1]}
              </>
            ) : (
              title
            )}
          </h2>
          <p className="mt-[3px] text-2xs whitespace-pre-line text-black">
            {subtitle}
          </p>
        </div>
        <Image
          src="/landing/wand.png"
          alt=""
          aria-hidden="true"
          width={86}
          height={137}
          className="pointer-events-none h-auto w-[86px] shrink-0 select-none object-contain"
        />
      </div>

      <div className="mt-2 flex w-full flex-col gap-[5px]">
        {items.map((item, index) => (
          <div
            key={item.title}
            className="flex flex-col items-start gap-1 rounded-[20px] bg-white px-5 py-2.5"
          >
            <Image
              src={ILLUSTRATIONS[index]?.src ?? ILLUSTRATIONS[0].src}
              alt=""
              width={ILLUSTRATIONS[index]?.width ?? 48}
              height={ILLUSTRATIONS[index]?.height ?? 48}
              className="h-[47px] w-auto object-contain"
            />
            <h3 className="text-[12.3px] leading-[15px] font-semibold text-black">
              {item.title}
            </h3>
            <p className="text-justify text-[8.6px] leading-2.5 font-light text-black">
              {item.body}
            </p>
          </div>
        ))}

        <div aria-hidden="true" className="mt-1 flex items-center gap-[42px]">
          <span className="h-px min-w-[40px] flex-1 border-t border-white" />
          <span className="w-[14px] text-center text-[21px] leading-none font-bold text-white">
            ✦
          </span>
          <span className="h-px min-w-[60px] flex-1 border-t border-white" />
        </div>

        <p className="mt-1 text-center text-2xs text-black">{helpTitle}</p>
        <Link
          href="/contact"
          className="flex min-h-[31px] h-auto min-w-[131px] max-w-full items-center justify-center rounded-[5px] bg-cta-strong px-3 py-2 text-center text-[9.8px] leading-3 font-medium text-white transition-colors hover:bg-cta-active focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cta-strong active:bg-cta-active"
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

      <section className="hidden w-full bg-landing-rose sm:block">
        <div className="mx-auto max-w-[1344px] px-10 pt-[51px] pb-8">
          <div className="flex items-center">
            <div className="min-w-0 flex-1 pl-4 text-left">
              <h2
                className="font-bold text-black"
                style={{ fontWeight: 700, fontSize: 45, lineHeight: "53px" }}
              >
                <BrandTitle title={t("title")} />
              </h2>
              <p
                className="mt-1 text-black min-[1400px]:whitespace-nowrap"
                style={{ fontWeight: 400, fontSize: 24, lineHeight: "28px" }}
              >
                {t("subtitle").replace(/\n/g, " ")}
              </p>
            </div>
          </div>

          {/*
            The lightstick peeks out from behind the third card: it is anchored
            to the top edge of the card grid (not the section) and sits under the
            cards in the stacking order, so the card's top edge hides the handle.
            Overlap instead of cropping keeps the cut aligned if content height
            changes.
          */}
          <div className="relative mt-8 md:mt-[96px] lg:mt-[120px]">
            <Image
              src="/landing/wand.png"
              alt=""
              aria-hidden="true"
              width={928}
              height={1152}
              className="pointer-events-none absolute right-2 bottom-[calc(100%-78px)] z-0 hidden h-[200px] w-auto select-none md:block lg:right-4 lg:bottom-[calc(100%-94px)] lg:h-[240px]"
            />

            <div className="relative z-10 grid gap-2.5 md:grid-cols-3">
              {items.map((item, index) => (
                <div
                  key={item.title}
                  className="relative flex flex-col items-center rounded-[32px] border border-white/80 bg-card px-10 py-6 text-center shadow-[var(--shadow-soft)]"
                >
                  <Image
                    src={ILLUSTRATIONS[index]?.src ?? ILLUSTRATIONS[0].src}
                    alt=""
                    width={ILLUSTRATIONS[index]?.width ?? 104}
                    height={ILLUSTRATIONS[index]?.height ?? 96}
                    className="h-[96px] w-auto object-contain"
                  />
                  <h3
                    className="mt-2 font-semibold text-black"
                    style={{ fontSize: 25, lineHeight: "30px" }}
                  >
                    {item.title}
                  </h3>
                  <p
                    className="mt-1 text-justify font-light text-black"
                    style={{ fontSize: 18, lineHeight: "22px" }}
                  >
                    {item.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Divider spans the section (3% side margin), wider than the cards. */}
        <div
          aria-hidden="true"
          className="mx-[3%] flex items-center justify-center gap-[96px]"
        >
          <span className="h-0 flex-1 border-t-2 border-white" />
          <span className="w-8 text-center text-[42px] font-bold leading-none text-white">
            ✦
          </span>
          <span className="h-0 flex-1 border-t-2 border-white" />
        </div>

        <div className="mx-auto max-w-[1344px] px-10 pt-4 pb-[51px]">
          <div className="flex flex-col items-center gap-4 text-center">
            <p
              style={{ fontWeight: 400, fontSize: 23, lineHeight: "28px" }}
              className="text-black"
            >
              {t("helpTitle")}
            </p>
            <Link
              href="/contact"
              style={{ fontWeight: 700, fontSize: 20, lineHeight: "24px" }}
              className="flex min-h-[63px] h-auto min-w-[267px] max-w-full items-center justify-center rounded-[10.7px] bg-cta px-6 py-4 text-center text-white transition-colors hover:bg-cta-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cta-strong active:bg-cta-active"
            >
              {t("helpCta")}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
