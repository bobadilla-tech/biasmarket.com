"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { Link, useRouter } from "@/i18n/navigation";
import { storesApi } from "@/features/stores";
import { Field } from "@/components/ui/field";
import {
  FormErrorSummary,
  FormField,
  formErrorMessage,
} from "@/components/shared/form-a11y";
import { type LoginInput, loginSchema } from "../schemas/login.schema";

const inputClassName =
  "w-full rounded-xl border border-gray-200 px-4 py-2.5 text-base text-gray-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-gray-600 md:text-sm";

export function LoginForm() {
  const t = useTranslations("onboarding.login");
  const router = useRouter();

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
    if (data.user.role === "admin") {
      router.push("/admin");
      return;
    }

    // First-time sellers (no store yet) still go through first-store
    // onboarding; returning sellers skip it — onboarding is a one-time
    // setup flow, not the permanent post-login landing page.
    const stores = await storesApi.listMine();
    if (stores.length === 0) {
      router.push("/onboarding/create-store");
    } else if (stores.length === 1) {
      router.push(`/dashboard/${stores[0].slug}`);
    } else {
      router.push("/account");
    }
  };

  return (
    <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col gap-5">
      <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>

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
          className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
        >
          {isSubmitting ? t("submitting") : t("submit")}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500">
        {t("noAccount")}{" "}
        <Link
          href="/onboarding"
          className="text-emerald-600 font-medium hover:underline"
        >
          {t("signUpLink")}
        </Link>
      </p>
    </div>
  );
}
