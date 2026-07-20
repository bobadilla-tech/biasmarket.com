"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

export function FinalHook() {
  const t = useTranslations("landing.finalHook");

  return (
    <footer className="border-t border-white/10 px-6 py-16 text-center sm:px-10">
      <div className="mx-auto max-w-xl">
        <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {t("title")}
        </h2>
        <p className="mt-2 text-muted-foreground">{t("content")}</p>
        <Button size="lg" className="mt-6 h-11 px-6">
          {t("cta")}
        </Button>
      </div>
    </footer>
  );
}
