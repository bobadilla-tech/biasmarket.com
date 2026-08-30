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
          className="flex min-h-[31px] h-auto min-w-[131px] max-w-full items-center justify-center rounded-[5px] bg-[#b0006d] px-3 py-2 text-center text-[9.8px] leading-3 font-medium text-white transition-colors hover:bg-[#8f0059]"
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
        <div className="mx-auto max-w-[1344px] px-10 py-[51px]">
          <div className="flex items-center justify-center gap-8">
            <div className="max-w-[1045px] text-center">
              <h2
                className="font-bold text-black"
                style={{ fontWeight: 700, fontSize: 45, lineHeight: "53px" }}
              >
                {t("title")}
              </h2>
              <p
                className="mt-1 text-black"
                style={{ fontWeight: 400, fontSize: 24, lineHeight: "28px" }}
              >
                {t("subtitle").replace(/\n/g, " ")}
              </p>
            </div>
            <Image
              src="/landing/wand.png"
              alt=""
              width={175}
              height={280}
              className="hidden h-[280px] w-auto shrink-0 object-contain select-none lg:block"
            />
          </div>

          <div className="mt-8 grid gap-[10px] md:grid-cols-3">
            {items.map((item, index) => (
              <div
                key={item.title}
                className="flex flex-col items-center rounded-[40.8px] bg-white px-10 py-6 text-center"
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

          <div className="mt-8 flex flex-col items-center gap-4 text-center">
            <div
              aria-hidden="true"
              className="flex w-full items-center justify-center gap-4"
            >
              <span className="h-0 flex-1 border-t-2 border-white" />
              <span className="text-[42px] font-bold leading-none text-white">
                ✦
              </span>
              <span className="h-0 flex-1 border-t-2 border-white" />
            </div>

            <p
              style={{ fontWeight: 400, fontSize: 23, lineHeight: "28px" }}
              className="text-black"
            >
              {t("helpTitle")}
            </p>
            <Link
              href="/contact"
              style={{ fontWeight: 600, fontSize: 20, lineHeight: "24px" }}
              className="flex min-h-[63px] h-auto min-w-[267px] max-w-full items-center justify-center rounded-[10.7px] bg-[#b0006d] px-6 py-4 text-center text-white transition-colors hover:bg-[#8f0059]"
            >
              {t("helpCta")}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
