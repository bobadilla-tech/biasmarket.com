import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function NotFound() {
  const t = await getTranslations("common.notFoundPage");

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-bold text-gray-900">{t("title")}</h1>
        <p className="mt-2 text-gray-500">{t("body")}</p>
        <Link href="/" className="mt-4 inline-block text-emerald-600 font-semibold hover:underline">
          {t("backHome")}
        </Link>
      </div>
    </div>
  );
}
