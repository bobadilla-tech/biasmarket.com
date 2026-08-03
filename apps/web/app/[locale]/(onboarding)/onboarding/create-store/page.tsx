import type { Metadata } from "next";
import type { Locale } from "next-intl";
import { getTranslations } from "next-intl/server";
import { CreateStoreForm, MyStoresList } from "@/features/stores";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: Locale }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "onboarding.createStore" });
  return { title: t("title") };
}

export default function CreateStorePage() {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(167,139,250,0.2),transparent_28%),linear-gradient(180deg,#f7f0ff_0%,#fdfbff_100%)] px-4 py-8 md:px-6">
      <div className="mx-auto grid max-w-[1600px] gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <MyStoresList />
        <CreateStoreForm />
      </div>
    </div>
  );
}
