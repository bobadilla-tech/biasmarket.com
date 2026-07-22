"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { BOBADILLA_TECH_URL } from "@/lib/site-config";

export function Footer() {
  const t = useTranslations("marketing.footer");

  return (
    <footer className="border-t border-white/10 px-6 py-10 sm:px-10">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-6 text-center sm:flex-row sm:justify-between sm:text-left">
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:gap-10">
          <Link href="/">
            <img
              src="/logos/vertical-only-title.png"
              alt="Bias Market"
              width={95}
              height={80}
              className="h-12 w-auto"
            />
          </Link>

          <nav className="flex items-center gap-6 text-sm text-muted-foreground">
            <Link href="/" className="hover:text-foreground">
              {t("navHome")}
            </Link>
            <Link href="/founder" className="hover:text-foreground">
              {t("navFounder")}
            </Link>
            <Link href="/enterprise" className="hover:text-foreground">
              {t("navEnterprise")}
            </Link>
          </nav>
        </div>

        <div className="flex flex-col items-center gap-1 text-sm text-muted-foreground sm:items-end">
          <p>
            {t.rich("credit", {
              name: (chunks) => (
                <a
                  href={BOBADILLA_TECH_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-foreground hover:underline"
                >
                  {chunks}
                </a>
              ),
            })}
          </p>
          <p>{t("copyright", { year: new Date().getFullYear() })}</p>
        </div>
      </div>
    </footer>
  );
}
