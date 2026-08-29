"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import * as Sentry from "@sentry/react";
import { ErrorState } from "@/components/shared/error-state";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations("common.errorPage");

  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-dvh flex items-center justify-center bg-gray-50 px-6"
    >
      <div className="w-full max-w-md">
        <ErrorState
          title={t("title")}
          message={error.message || t("body")}
          retry={reset}
          retryLabel={t("retry")}
        />
      </div>
    </main>
  );
}
