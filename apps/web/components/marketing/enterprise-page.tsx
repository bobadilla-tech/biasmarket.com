"use client";

import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { CONTACT_EMAIL } from "@/lib/site-config";
import { Footer } from "./footer";

interface FeatureItem {
  title: string;
  body: string;
}

export function EnterprisePage() {
  const t = useTranslations("marketing.enterprisePage");
  const features = t.raw("features") as FeatureItem[];

  return (
    <div className="landing-theme min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-6 pt-24 pb-20 sm:px-10">
        <span className="text-sm font-semibold tracking-widest text-muted-foreground uppercase">
          {t("overline")}
        </span>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
          {t("headline")}
        </h1>
        <p className="mt-6 text-lg text-muted-foreground">{t("intro")}</p>

        <section className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {features.map((item) => (
            <div
              key={item.title}
              className="rounded-2xl border border-white/10 p-6"
            >
              <h3 className="font-semibold">{item.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">
                {item.body}
              </p>
            </div>
          ))}
        </section>

        <section className="mt-16 rounded-2xl border border-white/10 p-8 text-center">
          <h2 className="text-2xl font-bold tracking-tight">
            {t("cta.heading")}
          </h2>
          <p className="mt-2 text-muted-foreground">{t("cta.body")}</p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className={buttonVariants({ size: "lg", className: "mt-6 h-11 px-6" })}
          >
            {t("cta.button")}
          </a>
        </section>
      </div>
      <Footer />
    </div>
  );
}
