"use client";

import { Search, ShoppingBag, Store } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

const STEPS = [
  { icon: Search, key: "discover", href: "/search" },
  { icon: Store, key: "shops", href: "/stores" },
  { icon: ShoppingBag, key: "collect", href: "/search" },
] as const;

export function FanJourneySection() {
  const t = useTranslations("landing.fanJourney");

  return (
    <section className="mx-auto w-full max-w-[1344px] px-4 py-4 sm:px-10 sm:py-7">
      <div className="landing-fan-journey relative isolate rounded-[28px] px-5 py-7 text-white sm:rounded-[36px] sm:px-9 sm:py-10 lg:px-12">
        <div aria-hidden="true" className="landing-fan-journey-orbit" />
        <div className="relative z-10">
          <div className="max-w-2xl">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.2em] text-[#f3aed9] sm:text-sm">
              {t("eyebrow")}
            </p>
            <h2 className="text-balance text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-4xl">
              {t("title")}
            </h2>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/70 sm:text-base">
              {t("subtitle")}
            </p>
          </div>
          <div className="landing-fan-journey-steps mt-6 grid gap-3 sm:mt-8 md:grid-cols-3">
            {STEPS.map(({ icon: Icon, key, href }, index) => (
              <Link
                key={key}
                href={href}
                className="landing-fan-step group flex h-auto min-h-24 items-center gap-4 rounded-2xl px-4 py-4 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white sm:min-h-28 sm:px-5"
              >
                <span className="landing-fan-step-icon inline-flex size-12 shrink-0 items-center justify-center rounded-2xl text-[#ffd2ed]">
                  <Icon
                    aria-hidden="true"
                    className="size-5"
                    strokeWidth={1.8}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[10px] font-bold uppercase tracking-[0.18em] text-white/45">
                    {t("step", { number: index + 1 })}
                  </span>
                  <span className="mt-1 block text-base font-bold leading-snug text-white sm:text-lg">
                    {t(`steps.${key}.title`)}
                  </span>
                  <span className="mt-1 block text-sm leading-relaxed text-white/65">
                    {t(`steps.${key}.body`)}
                  </span>
                </span>
                <span
                  aria-hidden="true"
                  className="text-xl text-[#f3aed9] transition-transform group-hover:translate-x-1"
                >
                  ↗
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
