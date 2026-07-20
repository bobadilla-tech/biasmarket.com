"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";

export function LanguageToggle() {
  const locale = useLocale();
  const t = useTranslations("landing.languageToggle");
  const pathname = usePathname();
  const target = locale === "es" ? "en" : "es";

  return (
    <Link
      href={pathname}
      locale={target}
      className="inline-flex h-8 items-center justify-center rounded-lg border border-white/15 bg-white/5 px-3 text-sm font-medium text-foreground transition-colors hover:bg-white/10"
    >
      {t(target)}
    </Link>
  );
}
