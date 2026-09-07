import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

// The 404 status code is the authoritative signal (Google won't index a
// 404-status page regardless of meta), so this is belt-and-suspenders, not a
// bug fix — see docs/plans/2026-09-07-gsc-indexing-audit-organic-growth-plan.md
// Phase C.
export const metadata: Metadata = { robots: { index: false } };

export default async function NotFound() {
  const t = await getTranslations("common.notFoundPage");

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-dvh flex items-center justify-center bg-gray-50 px-6"
    >
      <div className="max-w-md text-center">
        <h1 className="text-xl font-bold text-gray-900">{t("title")}</h1>
        <p className="mt-2 text-gray-500">{t("body")}</p>
        <Link
          href="/"
          className="mt-4 inline-block text-emerald-600 font-semibold hover:underline"
        >
          {t("backHome")}
        </Link>
      </div>
    </main>
  );
}
