"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { Link, useRouter } from "@/i18n/navigation";
import { Field } from "@/components/ui/field";
import {
  formErrorMessage,
  FormErrorSummary,
  FormField,
} from "@/components/shared/form-a11y";
import { resolveSellerHomePath } from "../lib/seller-home-path";
import { type LoginInput, loginSchema } from "../schemas/login.schema";

const inputClassName =
  "w-full rounded-xl border border-[#d9d2e9] bg-white/85 px-4 py-3 text-base text-[#27213b] outline-none transition placeholder:text-[#827995] focus:border-[#8761d9] focus:ring-2 focus:ring-[#c8b5f5]/60 md:text-sm";

export function LoginForm() {
  const t = useTranslations("onboarding.login");
  const router = useRouter();
  const locale = useLocale();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });
  const tCommon = useTranslations("common");

  const onSubmit = async (values: LoginInput) => {
    const { data, error } = await authClient.signIn.email(values);
    if (error) {
      setError("root", { message: error.message ?? t("invalidCredentials") });
      return;
    }
    router.push(await resolveSellerHomePath(data.user.role));
  };

  const onGoogle = async () => {
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: `${window.location.origin}/${locale}/verify-email`,
      errorCallbackURL: `${window.location.origin}/${locale}/auth/error`,
    });
    if (error) {
      setError("root", { message: error.message ?? t("googleError") });
    }
  };

  return (
    <div className="login-card flex w-full flex-col gap-5 rounded-[26px] border border-white/90 bg-white/90 p-6 shadow-[0_28px_80px_rgba(65,47,105,0.16)] backdrop-blur-xl sm:p-8">
      <div>
        <p className="mb-2 text-[10px] font-semibold tracking-[0.24em] text-[#8066b4]">
          {t("welcomeEyebrow")}
        </p>
        <h2 className="font-serif text-3xl font-semibold tracking-[-0.045em] text-[#1e1930] sm:text-[2.1rem]">
          {t("welcomeTitle")}
        </h2>
        <p className="mt-1.5 text-sm text-[#6b637f]">{t("welcomeSubtitle")}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormErrorSummary
          id="seller-login-error-summary"
          title={tCommon("formErrorsSummary")}
          messages={[
            errors.email || errors.password ? tCommon("formErrorsSummary") : "",
            errors.root?.message ?? "",
          ].filter(Boolean)}
        />
        <FormField
          id="seller-login-email"
          label={t("emailPlaceholder")}
          error={formErrorMessage(errors.email, t("invalidEmail"))}
        >
          {(props) => (
            <Field.Control
              {...props}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={t("emailPlaceholder")}
              className={inputClassName}
              {...register("email")}
            />
          )}
        </FormField>

        <FormField
          id="seller-login-password"
          label={t("passwordPlaceholder")}
          error={formErrorMessage(errors.password, t("passwordRequired"))}
        >
          {(props) => (
            <div className="relative">
              <Field.Control
                {...props}
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                placeholder={t("passwordPlaceholder")}
                className={`${inputClassName} pr-12`}
                {...register("password")}
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={
                  showPassword ? t("hidePassword") : t("showPassword")
                }
                aria-pressed={showPassword}
                className="absolute inset-y-0 right-1 flex min-h-11 min-w-11 items-center justify-center rounded-lg text-[#776b91] transition hover:text-[#6542ba] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8761d9]"
              >
                {showPassword ? (
                  <EyeOff aria-hidden="true" size={18} />
                ) : (
                  <Eye aria-hidden="true" size={18} />
                )}
              </button>
            </div>
          )}
        </FormField>

        <button
          type="submit"
          disabled={isSubmitting}
          className="mt-1 min-h-12 w-full rounded-xl bg-gradient-to-r from-[#7953d5] via-[#9163e6] to-[#a56be9] py-3 text-sm font-semibold text-white shadow-[0_9px_22px_rgba(123,80,206,0.25)] transition hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7048cf] focus-visible:ring-offset-2 disabled:opacity-60"
        >
          {isSubmitting ? t("submitting") : t("submit")}
        </button>
      </form>

      <div className="relative flex items-center gap-3 text-xs text-[#807694] before:h-px before:flex-1 before:bg-[#e1dbea] after:h-px after:flex-1 after:bg-[#e1dbea]">
        {t("or")}
      </div>

      <button
        type="button"
        onClick={onGoogle}
        className="flex min-h-12 w-full items-center justify-center gap-3 rounded-xl border border-[#d9d2e9] bg-white/70 py-3 text-sm font-semibold text-[#28223a] transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8761d9] focus-visible:ring-offset-2"
      >
        <span aria-hidden="true" className="font-bold text-base text-[#4285f4]">
          G
        </span>
        {t("google")}
      </button>

      <p className="text-center text-sm text-[#625a74]">
        {t("noAccount")}{" "}
        <Link
          href="/onboarding"
          className="font-semibold text-[#744bd2] underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8761d9]"
        >
          {t("signUpLink")}
        </Link>
      </p>
    </div>
  );
}
