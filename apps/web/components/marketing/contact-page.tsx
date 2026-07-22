"use client";

import { useTranslations } from "next-intl";
import { CONTACT_EMAIL } from "@/lib/site-config";
import { ContactForm } from "./contact-form";
import { Footer } from "./footer";
import { ScheduleCallCard } from "./schedule-call-card";

export function ContactPage() {
  const t = useTranslations("marketing.contactPage");

  return (
    <div className="landing-theme min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 pt-24 pb-20 sm:px-10">
        <span className="text-sm font-semibold tracking-widest text-muted-foreground uppercase">
          {t("overline")}
        </span>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
          {t("headline")}
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground">
          {t("intro")}
        </p>

        <div className="mt-12">
          <ScheduleCallCard />
        </div>

        <div className="mt-12 grid gap-8 sm:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold">{t("emailHeading")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {t("emailBody")}{" "}
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="text-foreground hover:underline"
              >
                {CONTACT_EMAIL}
              </a>
            </p>
          </div>

          <ContactForm />
        </div>
      </div>
      <Footer />
    </div>
  );
}
