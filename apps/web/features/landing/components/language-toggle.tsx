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
      className="inline-flex min-h-11 items-center justify-center rounded-lg border border-black/15 bg-transparent px-3 text-sm font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
    >
      {t(target)}
    </Link>
  );
}
