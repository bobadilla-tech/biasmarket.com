"use client";

import { useTranslations } from "next-intl";
import { ErrorState } from "@/components/shared/error-state";

// Generic copy only: never render `error.message` on this route (the parent
// boundary shows it and reports to Sentry), and never report from here, since
// the URL carries the private token.
export default function PedidoError({ reset }: { reset: () => void }) {
  const t = useTranslations("storefront.publicOrder");
  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-16 pt-24 sm:pt-24">
      <ErrorState
        title={t("error.title")}
        message={t("error.body")}
        retry={reset}
        retryLabel={t("retry")}
      />
    </main>
  );
}
