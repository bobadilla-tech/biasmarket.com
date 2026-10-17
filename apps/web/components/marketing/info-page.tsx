import { getTranslations } from "next-intl/server";
import type { Locale } from "next-intl";
import { ForSellersFooter } from "@/features/for-sellers/components/footer";

interface InfoSection {
  heading: string;
  paragraphs: string[];
}

export type InfoDoc = "howToBuy" | "howItWorks" | "faq" | "help";

export async function InfoPage({
  locale,
  doc,
}: {
  locale: Locale;
  doc: InfoDoc;
}) {
  const t = await getTranslations({ locale, namespace: "marketing.info" });
  const sections = t.raw(`${doc}.sections`) as InfoSection[];

  return (
    <div className="landing-theme min-h-screen bg-background text-foreground">
      <main className="mx-auto max-w-3xl px-6 pt-24 pb-20 sm:px-10">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          {t(`${doc}.title`)}
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted-foreground">
          {t(`${doc}.intro`)}
        </p>
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
