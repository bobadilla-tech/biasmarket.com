"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SignupForm } from "@/features/onboarding";

export function OnboardingPageClient() {
  const t = useTranslations("onboarding.signup");
  const [checkEmail, setCheckEmail] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [checkEmail]);

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

        <SignupForm onCheckEmail={() => setCheckEmail(true)} />

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
