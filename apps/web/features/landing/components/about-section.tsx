"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

interface AboutItem {
  title: string;
  body: string;
  width?: number;
}

const ILLUSTRATIONS = [
  { src: "/landing/people.png", alt: "", width: 268, height: 148 },
  { src: "/landing/store.png", alt: "", width: 224, height: 153 },
  { src: "/landing/shield.png", alt: "", width: 258, height: 173 },
];

export function AboutSection() {
  const t = useTranslations("landing.about");
  const items = t.raw("items") as AboutItem[];

  return (
    <section className="w-full bg-[#FFEAF6]">
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

        <div className="mt-8 flex items-center justify-center gap-8 sm:mt-10 sm:gap-12 lg:gap-24">
          {ILLUSTRATIONS.map(({ src, alt, width, height }) => (
            <Image
              key={src}
              src={src}
              alt={alt}
              width={width}
              height={height}
              className="w-auto object-contain"
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
                <span style={{ display: "block", maxWidth: item.width ?? 323 }}>
                  {item.body}
                </span>
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
  );
}
