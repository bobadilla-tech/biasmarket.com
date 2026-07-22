"use client";

import { Calendar } from "lucide-react";
import { useTranslations } from "next-intl";
import { buttonVariants } from "@/components/ui/button";
import { CAL_COM_URL } from "@/lib/site-config";

export function ScheduleCallCard() {
  const t = useTranslations("marketing.scheduleCallCard");

  return (
    <div className="flex flex-col items-start gap-4 rounded-2xl border border-white/10 p-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-brand-violet/30">
          <Calendar className="size-5 text-white" />
        </div>
        <div>
          <p className="font-semibold">{t("text")}</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
      </div>
      <a
        href={CAL_COM_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={buttonVariants({ className: "h-10 shrink-0 px-5" })}
      >
        {t("cta")}
        <span className="sr-only">{t("opensInNewTab")}</span>
      </a>
    </div>
  );
}
