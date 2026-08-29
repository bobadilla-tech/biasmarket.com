"use client";

import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { CONTACT_EMAIL } from "@/lib/site-config";
import { Footer } from "./footer";

interface TeamMember {
  name: string;
  role: string;
  bio: string;
}

export function FounderPage() {
  const t = useTranslations("marketing.founderPage");
  const team = t.raw("team") as TeamMember[];

  return (
    <div className="landing-theme min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-3xl px-6 pt-24 pb-20 sm:px-10">
        <header>
          <span className="text-sm font-semibold tracking-widest text-muted-foreground uppercase">
            {t("overline")}
          </span>
          <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">
            {t("headline")}
          </h1>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground">
            {t("intro")}
          </p>
        </header>

        <section
          aria-labelledby="founder-team-heading"
          className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-3"
        >
          <h2 id="founder-team-heading" className="sr-only">
            {t("teamHeading")}
          </h2>
          {team.map((member) => (
            <div
              key={member.name}
              className="rounded-2xl border border-black/10 p-6"
            >
              <h3 className="font-semibold">{member.name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {member.role}
              </p>
              <p className="mt-3 text-sm text-muted-foreground">{member.bio}</p>
            </div>
          ))}
        </section>

        <section
          aria-labelledby="founder-cta-heading"
          className="mt-16 rounded-2xl border border-black/10 p-8 text-center"
        >
          <h2
            id="founder-cta-heading"
            className="text-2xl font-bold tracking-tight"
          >
            {t("cta.heading")}
          </h2>
          <p className="mt-2 text-muted-foreground">{t("cta.body")}</p>
          <a
            href={`mailto:${CONTACT_EMAIL}`}
            className={buttonVariants({
              size: "lg",
              className: "mt-6 h-11 px-6",
            })}
          >
            {t("cta.button")}
          </a>
        </section>
      </div>
      <Footer />
    </div>
  );
}
