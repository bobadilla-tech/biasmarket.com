import { getTranslations } from "next-intl/server";
import type { Locale } from "next-intl";
import { ForSellersFooter } from "@/features/for-sellers/components/footer";

interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export async function LegalPage({
  locale,
  doc,
}: {
  locale: Locale;
  doc: "privacy" | "terms";
}) {
  const t = await getTranslations({ locale, namespace: "marketing.legal" });
  const sections = t.raw(`${doc}.sections`) as LegalSection[];

  return (
    <div className="landing-theme min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-3xl px-6 pt-24 pb-20 sm:px-10">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          {t(`${doc}.title`)}
        </h1>
        <p className="mt-4 text-sm text-muted-foreground">{t("updated")}</p>
        {sections.map((section) => (
          <section key={section.heading} className="mt-10">
            <h2 className="text-xl font-semibold">{section.heading}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="mt-3 text-muted-foreground">
                {paragraph}
              </p>
            ))}
          </section>
        ))}
      </main>
      <ForSellersFooter />
    </div>
  );
}
