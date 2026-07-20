"use client";

import { useTranslations } from "next-intl";

export function Problem() {
  const t = useTranslations("landing.problem");
  const items = t.raw("items") as string[];
  const painPoints = t.raw("painPoints") as string[];

  return (
    <section className="border-t border-white/10 bg-black/20 px-6 py-20 sm:px-10">
      <div className="mx-auto max-w-3xl">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {t("title")}
        </h2>
        <p className="mt-6 text-muted-foreground">{t("intro")}</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {items.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-brand-pink" />
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-8 font-medium text-brand-pink">{t("escalation")}</p>
        <ul className="mt-3 grid gap-2 text-muted-foreground sm:grid-cols-2">
          {painPoints.map((item) => (
            <li key={item} className="flex items-start gap-2">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-white/30" />
              {item}
            </li>
          ))}
        </ul>
        <p className="mt-8 text-lg font-semibold">{t("outro")}</p>
      </div>
    </section>
  );
}
