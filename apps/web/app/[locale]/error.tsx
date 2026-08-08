"use client";

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

  Sentry.captureException(error);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
      <div className="w-full max-w-md">
        <ErrorState
          title={t("title")}
          message={error.message || t("body")}
          retry={reset}
          retryLabel={t("retry")}
        />
      </div>
    </div>
  );
}
