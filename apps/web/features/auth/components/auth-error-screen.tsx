"use client";

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { Link } from "@/i18n/navigation";
import { type AuthErrorKind, classifyAuthError } from "../lib/auth-error";

const kindsWithRetry: ReadonlySet<AuthErrorKind> = new Set([
  "cancelled",
  "expired",
  "googleProblem",
  "generic",
]);

// Where OAuth failures from the seller Google sign-in land (see
// `onAPIError.errorURL` in apps/api's auth config and the `errorCallbackURL`
// the login/signup forms pass). Explains what happened in plain language
// instead of leaving the person on the API's raw JSON.
export function AuthErrorScreen({ code }: { code?: string }) {
  const t = useTranslations("onboarding.authError");
  const locale = useLocale();
  const kind = classifyAuthError(code);
  const [retrying, setRetrying] = useState(false);

  const retryWithGoogle = async () => {
    setRetrying(true);
    const origin = globalThis.location.origin;
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: `${origin}/${locale}/verify-email`,
      errorCallbackURL: `${origin}/${locale}/auth/error`,
    });
    // On success the browser is already navigating to Google.
    if (error) setRetrying(false);
  };

  const actionClassName =
    "w-full rounded-xl border border-gray-200 py-2.5 text-center text-sm font-semibold text-gray-700 transition hover:bg-gray-50";

  return (
    <div
      role="alert"
      className="flex w-full max-w-md flex-col gap-5 rounded-2xl border border-gray-100 bg-white p-8 shadow-sm"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-amber-50 text-amber-700">
          <AlertTriangle className="size-5" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-xl font-bold text-gray-900">
            {t(`${kind}.title`)}
          </h1>
          <p className="mt-2 text-sm text-gray-600">{t(`${kind}.body`)}</p>
        </div>
      </div>

      <div>
        <p className="text-sm font-semibold text-gray-900">{t("nextSteps")}</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">
          {(t.raw(`${kind}.steps`) as string[]).map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        {kindsWithRetry.has(kind) && (
          <button
            type="button"
            onClick={retryWithGoogle}
            disabled={retrying}
            className="w-full rounded-xl bg-emerald-700 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
          >
            {t("retryGoogle")}
          </button>
        )}
        <Link href="/login" className={actionClassName}>
          {t("loginWithEmail")}
        </Link>
        <Link href="/contact" className={actionClassName}>
          {t("contact")}
        </Link>
      </div>
    </div>
  );
}
