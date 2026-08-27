"use client";

import { CircleArrowRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { StoreLogo } from "@/components/store-logo";
import type { LandingStore } from "@/features/discovery/server";
import { Link } from "@/i18n/navigation";

function MobileStoreRow({ store }: { store: LandingStore }) {
  return (
    <Link
      href={`/store/${store.slug}`}
      className="mx-auto flex h-[92px] w-full max-w-[300px] items-center gap-4 rounded-[10px] border border-[#AAA8A8] bg-white pr-4 pl-3 transition hover:shadow-md"
    >
      <StoreLogo
        name={store.name}
        logoUrl={store.logoUrl}
        size={64}
        className="shrink-0 text-lg font-bold"
        gradient={{ from: "#FC17A0", to: "#8D2FEB" }}
      />
      <span className="min-w-0 flex-1 truncate text-center text-base text-black">
        {store.name}
      </span>
    </Link>
  );
}

export function StoresSection({ stores }: { stores?: LandingStore[] | null }) {
  const t = useTranslations("landing.stores");
  const list = stores ?? [];

  return (
    <section className="px-6 py-8 sm:px-10 sm:py-14">
      <div className="sm:hidden">
        <h2 className="text-center text-[21px] leading-[26px] font-bold text-black">
          {t("title")}
        </h2>
        {list.length === 0 ? (
          <p className="mt-4 rounded-[10px] border border-dashed border-[#AAA8A8] px-4 py-6 text-center text-xs text-[#7A7A7A]">
            {t("empty")}
          </p>
        ) : (
          <div className="mt-4 flex flex-col gap-3">
            {list.map((store) => (
              <MobileStoreRow key={store.id} store={store} />
            ))}
          </div>
        )}
      </div>

      {/* Tablet/desktop — Figma "Descubre tiendas" */}
      <div className="mx-auto hidden max-w-[1344px] px-10 sm:block">
        <div className="flex items-center justify-between gap-8">
          <h2 className="text-[40px] leading-[48px] font-bold text-black">
            {t("title")}
          </h2>
          <Link
            href="/stores"
            className="flex items-center gap-3 text-[24px] leading-[29px] font-medium text-[#FC17A0] transition-colors hover:text-[#e0128d]"
          >
            {t("viewMore")}
            <CircleArrowRight className="size-7" strokeWidth={1.8} />
          </Link>
        </div>

        {list.length === 0 ? (
          <p className="mt-6 rounded-[10px] border border-dashed border-[#AAA8A8] px-4 py-10 text-center text-sm text-[#7A7A7A]">
            {t("empty")}
          </p>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-[40px] sm:mt-8">
            {list.map((store) => (
              <Link
                key={store.id}
                href={`/store/${store.slug}`}
                className="flex h-[129px] items-center gap-6 rounded-[18.8px] border-[1.88px] border-[#AAA8A8] bg-white px-8 transition hover:shadow-md"
              >
                <StoreLogo
                  name={store.name}
                  logoUrl={store.logoUrl}
                  size={96}
                  className="shrink-0 text-xl font-bold"
                  gradient={{ from: "#FC17A0", to: "#8D2FEB" }}
                />
                <span className="truncate text-[30.08px] leading-[36px] text-black">
                  {store.name}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
