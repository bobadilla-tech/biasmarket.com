"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";

export function SocialProof() {
  const t = useTranslations("landing.socialProof");
  const items = t.raw("items") as string[];

  return (
    <section className="px-6 py-16 sm:px-10">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t("title")}
        </h2>
        <p className="mt-3 text-muted-foreground">{t("intro")}</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {items.map((item) => (
            <Badge
              key={item}
              variant="secondary"
              className="bg-brand-violet/30 px-3 py-1 text-sm text-white"
            >
              {item}
            </Badge>
          ))}
        </div>
      </div>
    </section>
  );
}
