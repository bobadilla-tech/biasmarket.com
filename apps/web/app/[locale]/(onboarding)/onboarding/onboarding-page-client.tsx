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
      <div className="auth-theme flex min-h-dvh items-start justify-center px-4 py-10 sm:items-center">
        <div
          data-auth-card
          className="flex w-full max-w-sm flex-col gap-3 border bg-white p-8 text-center"
        >
          <ol aria-label={t("progressLabel")} className="sr-only">
            <li>{t("title")}</li>
            <li aria-current="step">{t("checkEmailTitle")}</li>
          </ol>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-2xl font-bold text-foreground outline-none"
          >
            {t("checkEmailTitle")}
          </h1>
          <p role="status" className="text-sm text-muted-foreground">
            {t("checkEmailBody")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-theme flex min-h-dvh items-start justify-center px-4 py-10 sm:items-center">
      <div
        data-auth-card
        className="flex w-full max-w-sm flex-col gap-5 border bg-white p-8"
      >
        <ol aria-label={t("progressLabel")} className="sr-only">
          <li aria-current="step">{t("title")}</li>
          <li>{t("checkEmailTitle")}</li>
        </ol>
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-2xl font-bold text-foreground outline-none"
        >
          {t("title")}
        </h1>

        <SignupForm onCheckEmail={() => setCheckEmail(true)} />

        <p className="text-center text-sm text-muted-foreground">
          {t("hasAccount")}{" "}
          <Link
            href="/login"
            className="font-semibold text-primary underline-offset-4 hover:underline"
          >
            {t("loginLink")}
          </Link>
        </p>
      </div>
    </div>
  );
}
