"use client";

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
  "w-full rounded-xl border border-input bg-card px-4 py-2.5 text-base text-foreground outline-none transition placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20 md:text-sm";

export function LoginForm() {
  const t = useTranslations("onboarding.login");
  const router = useRouter();
  const locale = useLocale();

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
    <div
      data-auth-card
      className="w-full max-w-sm border bg-white p-8 flex flex-col gap-5"
    >
      <h1 className="text-2xl font-bold text-foreground">{t("title")}</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
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
            <Field.Control
              {...props}
              type="password"
              autoComplete="current-password"
              placeholder={t("passwordPlaceholder")}
              className={inputClassName}
              {...register("password")}
            />
          )}
        </FormField>

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full min-h-11 rounded-xl bg-primary py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_8px_18px_rgb(120_73_158/20%)] transition-[transform,box-shadow,background-color] hover:-translate-y-0.5 hover:shadow-[0_12px_24px_rgb(120_73_158/26%)] disabled:opacity-60"
        >
          {isSubmitting ? t("submitting") : t("submit")}
        </button>
      </form>

      <button
        type="button"
        onClick={onGoogle}
        className="w-full min-h-11 rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/25 hover:bg-secondary"
      >
        {t("google")}
      </button>

      <p className="text-center text-sm text-muted-foreground">
        {t("noAccount")}{" "}
        <Link
          href="/onboarding"
          className="font-semibold text-primary underline-offset-4 hover:underline"
        >
          {t("signUpLink")}
        </Link>
      </p>
    </div>
  );
}
