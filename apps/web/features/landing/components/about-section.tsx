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
    <div className="flex flex-col bg-[#FFEAF6] p-[25px] sm:hidden">
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
                      "linear-gradient(90deg, #FC17A0 0%, #8D2FEB 100%)",
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
          <p className="mt-[3px] text-[11px] leading-[13px] whitespace-pre-line text-black">
            {subtitle}
          </p>
        </div>
        <Image
          src="/landing/wand.png"
          alt=""
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
            <p className="text-justify text-[8.6px] leading-[10px] font-light text-black">
              {item.body}
            </p>
          </div>
        ))}

        <div aria-hidden="true" className="mt-1 flex items-center gap-[7px]">
          <span className="h-px min-w-[60px] flex-1 border-t border-white" />
          <span className="text-[21px] leading-none font-bold text-white">
            ✦
          </span>
          <span className="h-px min-w-[60px] flex-1 border-t border-white" />
        </div>

        <p className="mt-1 text-center text-[11px] leading-[13px] text-black">
          {helpTitle}
        </p>
        <Link
          href="/contact"
          className="flex h-[31px] w-[131px] items-center justify-center rounded-[5px] bg-[#FC17A0] text-[9.8px] leading-3 font-medium text-white transition-colors hover:bg-[#e0128d]"
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
