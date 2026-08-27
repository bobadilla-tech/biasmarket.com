"use client";

import Image from "next/image";
import { CircleArrowLeft, CircleArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

interface BlogTeaser {
  title: string;
}

export function BlogSection() {
  const t = useTranslations("landing.blog");
  const items = t.raw("items") as BlogTeaser[];

  return (
    <section className="py-8 sm:py-14">
      <div className="sm:hidden px-5">
        <h2 className="text-[21px] leading-[26px] font-bold text-black">
          {t("title")}
        </h2>
        <div className="no-scrollbar mt-3 flex flex-nowrap snap-x snap-mandatory gap-8 overflow-x-auto">
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

      <div className="mx-auto hidden max-w-[1344px] px-10 sm:block">
        <h2 className="text-[32px] leading-[39px] font-bold text-black">
          {t("title")}
        </h2>

        <div className="mt-6 grid grid-cols-4 gap-[37.2px] sm:mt-8">
          {items.map(({ title }) => (
            <Link key={title} href="/blog" className="group">
              <div className="aspect-[260/220] w-full overflow-hidden rounded-[4px] bg-[#D9D9D9] transition group-hover:opacity-90" />
              <p className="mt-3 line-clamp-2 text-[28.9px] leading-[35px] font-bold text-black">
                {title}
              </p>
            </Link>
          ))}
        </div>

        <div
          aria-hidden="true"
          className="mt-6 flex items-center justify-end gap-1 sm:mt-8"
        >
          <CircleArrowLeft
            className="size-[46px] text-[#1C1B1F]"
            strokeWidth={1}
          />
          <CircleArrowRight
            className="size-[46px] text-[#1C1B1F]"
            strokeWidth={1}
          />
        </div>
      </div>
    </section>
  );
}
