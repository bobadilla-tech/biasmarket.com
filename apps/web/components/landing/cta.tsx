"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function Cta() {
  const t = useTranslations("landing.cta");

  return (
    <section className="border-t border-white/10 bg-gradient-to-br from-brand-violet/40 via-brand-ink to-brand-pink/20 px-6 py-20 text-center sm:px-10">
      <div className="mx-auto max-w-2xl">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          {t("title")}
        </h2>
        <p className="mt-4 text-muted-foreground">{t("content")}</p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Button size="lg" className="h-11 px-6">
            {t("ctaPrimary")}
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="h-11 border-white/15 bg-white/5 px-6 text-foreground hover:bg-white/10"
          >
            {t("ctaSecondary")}
          </Button>
        </div>
      </div>
    </section>
  );
}
