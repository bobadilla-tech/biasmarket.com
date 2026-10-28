import { getTranslations } from "next-intl/server";
import type { Locale } from "next-intl";
import { ContactSellerButton } from "@/features/customer-auth";

export async function PublicOrderUnavailable({
  slug,
  locale,
  unavailable = false,
}: {
  slug: string;
  locale: Locale;
  unavailable?: boolean;
}) {
  const t = await getTranslations({
    locale,
    namespace: "storefront.publicOrder",
  });
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex min-h-dvh items-center justify-center bg-gray-50 px-4 py-10"
    >
      <section className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <h1 className="text-2xl font-bold text-gray-950">
          {unavailable ? t("unavailableTitle") : t("invalidTitle")}
        </h1>
        <p className="mt-3 text-gray-600">
          {unavailable ? t("unavailableBody") : t("invalidBody")}
        </p>
        <div className="mt-6 flex justify-center">
          <ContactSellerButton slug={slug} />
        </div>
      </section>
    </main>
  );
}
