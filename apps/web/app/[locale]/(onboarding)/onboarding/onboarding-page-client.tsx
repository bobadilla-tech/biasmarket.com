"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { Link, useRouter } from "@/i18n/navigation";

export function OnboardingPageClient() {
  const t = useTranslations("onboarding.signup");
  const router = useRouter();
  const locale = useLocale();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [checkEmail]);

  const handleSignup = async () => {
    const { data, error } = await authClient.signUp.email({
      email,
      password,
      name,
      callbackURL: `${globalThis.location.origin}/${locale}/verify-email`,
    });
    if (error) setError(error.message ?? t("genericError"));
    else if (data.token === null) setCheckEmail(true);
    else router.push("/onboarding/create-store");
  };

  if (checkEmail) {
    return (
      <div className="min-h-dvh flex items-start justify-center bg-gray-50 px-4 py-10 sm:items-center">
        <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col gap-3 text-center">
          <ol aria-label={t("progressLabel")} className="sr-only">
            <li>{t("title")}</li>
            <li aria-current="step">{t("checkEmailTitle")}</li>
          </ol>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-2xl font-bold text-gray-900 outline-none"
          >
            {t("checkEmailTitle")}
          </h1>
          <p role="status" className="text-sm text-gray-600">
            {t("checkEmailBody")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh flex items-start justify-center bg-gray-50 px-4 py-10 sm:items-center">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col gap-5 ">
        <ol aria-label={t("progressLabel")} className="sr-only">
          <li aria-current="step">{t("title")}</li>
          <li>{t("checkEmailTitle")}</li>
        </ol>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-bold text-gray-900 outline-none"
        >
          {t("title")}
        </h1>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleSignup();
          }}
          className="contents"
        >
          <input
            aria-label={t("namePlaceholder")}
            autoComplete="name"
            placeholder={t("namePlaceholder")}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-gray-600"
          />
          <input
            aria-label={t("emailPlaceholder")}
            autoComplete="email"
            type="email"
            placeholder={t("emailPlaceholder")}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-gray-600"
          />
          <input
            aria-label={t("passwordPlaceholder")}
            autoComplete="new-password"
            placeholder={t("passwordPlaceholder")}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-gray-600"
          />

          {error && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-xl bg-emerald-700 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
          >
            {t("submit")}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500">
          {t("hasAccount")}{" "}
          <Link
            href="/login"
            className="text-emerald-700 font-medium hover:underline"
          >
            {t("loginLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}
