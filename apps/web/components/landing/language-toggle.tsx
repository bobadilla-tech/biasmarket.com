"use client";

import { Button } from "@/components/ui/button";
import { useLanguage } from "./language-provider";

export function LanguageToggle() {
  const { locale, copy, toggle } = useLanguage();
  const targetLabel = locale === "es" ? copy.languageToggle.en : copy.languageToggle.es;

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={toggle}
      className="border-white/15 bg-white/5 text-foreground hover:bg-white/10"
    >
      {targetLabel}
    </Button>
  );
}
