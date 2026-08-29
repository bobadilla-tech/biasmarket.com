"use client";

import { useTranslations } from "next-intl";

export function SkipLink({ targetId = "main-content" }: { targetId?: string }) {
  const t = useTranslations("common");

  return (
    <a
      href={`#${targetId}`}
      className="sr-only fixed top-4 left-4 z-[100] rounded-md bg-background px-4 py-2 text-sm font-semibold text-foreground shadow-lg outline-none focus:not-sr-only focus:ring-2 focus:ring-ring"
      onClick={(event) => {
        const target = document.getElementById(targetId);
        if (!target) return;

        event.preventDefault();
        target.focus();
        if (typeof target.scrollIntoView === "function") {
          target.scrollIntoView({ block: "start", behavior: "auto" });
        }
        window.history.replaceState(null, "", `#${targetId}`);
      }}
    >
      {t("skipToContent")}
    </a>
  );
}
