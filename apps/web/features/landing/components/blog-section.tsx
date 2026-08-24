"use client";

import Image from "next/image";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SectionHeading } from "./section-heading";

interface BlogTeaser {
  title: string;
}

/* Mobile — Figma Frame 74: horizontally scrolling teaser cards with grey
   placeholder art, all linking into the blog. */
export function BlogSection() {
  const t = useTranslations("landing.blog");
  const items = t.raw("items") as BlogTeaser[];

  return (
    <section className="py-8 sm:py-14">
      <div className="sm:hidden px-5">
        <h2 className="text-[21px] leading-[26px] font-bold text-black">
          {t("title")}
        </h2>
        <div className="no-scrollbar -mx-5 mt-3 flex snap-x snap-mandatory gap-8 overflow-x-auto px-5">
          {items.map(({ title }) => (
            <Link
              key={title}
              href="/blog"
              className="w-[144px] shrink-0 snap-start"
            >
              <div className="h-[122px] w-[144px] rounded-[4px] bg-[#D9D9D9]" />
              <p className="mt-1 line-clamp-2 min-h-[38px] text-[15px] leading-[19px] font-semibold text-black">
                {title}
              </p>
            </Link>
          ))}
        </div>
      </div>

      <div className="mx-auto hidden max-w-7xl px-10 sm:block">
        <SectionHeading title={t("title")} />
        <div className="mt-6 grid grid-cols-3 gap-8 sm:mt-8 lg:gap-12">
          {items.map(({ title }) => (
            <Link key={title} href="/blog" className="group">
              <div className="aspect-[144/122] w-full overflow-hidden rounded-[10px] bg-[#D9D9D9] transition group-hover:opacity-90" />
              <p className="mt-2 line-clamp-2 text-base leading-[19px] font-semibold text-black">
                {title}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
