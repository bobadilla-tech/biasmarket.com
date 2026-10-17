"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { AuthEditorialLayout } from "@/features/auth/components/auth-editorial-layout";
import { SignupForm } from "@/features/onboarding";

export function OnboardingPageClient() {
  const t = useTranslations("onboarding.signup");
  const [checkEmail, setCheckEmail] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [checkEmail]);

  return (
    <AuthEditorialLayout
      formSide="left"
      formLabel={checkEmail ? t("checkEmailTitle") : t("title")}
    >
      {checkEmail ? (
        <div className="login-card flex w-full flex-col gap-3 rounded-[26px] border border-white/90 bg-white/90 p-6 text-center shadow-[0_28px_80px_rgba(65,47,105,0.16)] backdrop-blur-xl sm:p-8">
          <ol aria-label={t("progressLabel")} className="sr-only">
            <li>{t("title")}</li>
            <li aria-current="step">{t("checkEmailTitle")}</li>
          </ol>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="font-serif text-3xl font-semibold text-[#1e1930] outline-none sm:text-[2.1rem]"
          >
            {t("checkEmailTitle")}
          </h1>
          <p role="status" className="text-sm leading-relaxed text-[#6b637f]">
            {t("checkEmailBody")}
          </p>
        </div>
      ) : (
        <div className="login-card flex w-full flex-col gap-4 rounded-[26px] border border-white/90 bg-white/90 p-6 shadow-[0_28px_80px_rgba(65,47,105,0.16)] backdrop-blur-xl sm:gap-5 sm:p-8">
          <ol aria-label={t("progressLabel")} className="sr-only">
            <li aria-current="step">{t("title")}</li>
            <li>{t("checkEmailTitle")}</li>
          </ol>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="font-serif text-3xl font-semibold text-[#1e1930] outline-none sm:text-[2.1rem]"
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
      )}
    </AuthEditorialLayout>
  );
}
