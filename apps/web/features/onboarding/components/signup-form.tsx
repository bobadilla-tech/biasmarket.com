"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "@/i18n/navigation";
import { type SignupInput, signupSchema } from "../schemas/signup.schema";

const inputClassName =
  "w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-gray-600";

export function SignupForm({ onCheckEmail }: { onCheckEmail: () => void }) {
  const t = useTranslations("onboarding.signup");
  const router = useRouter();
  const locale = useLocale();

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({ resolver: zodResolver(signupSchema) });

  const onSubmit = async (values: SignupInput) => {
    const { data, error } = await authClient.signUp.email({
      ...values,
      callbackURL: `${globalThis.location.origin}/${locale}/verify-email`,
    });
    if (error) {
      setError("root", { message: error.message ?? t("genericError") });
      return;
    }
    if (data.token === null) {
      onCheckEmail();
      return;
    }
    router.push("/onboarding/create-store");
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="contents">
      <div className="flex flex-col gap-1">
        <input
          {...register("name")}
          aria-describedby={errors.name ? "signup-name-error" : undefined}
          aria-invalid={errors.name ? true : undefined}
          aria-label={t("namePlaceholder")}
          autoComplete="name"
          placeholder={t("namePlaceholder")}
          className={inputClassName}
        />
        {errors.name ? (
          <p id="signup-name-error" className="text-sm text-red-600">
            {t("nameRequired")}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <input
          {...register("email")}
          aria-describedby={errors.email ? "signup-email-error" : undefined}
          aria-invalid={errors.email ? true : undefined}
          aria-label={t("emailPlaceholder")}
          autoComplete="email"
          type="email"
          placeholder={t("emailPlaceholder")}
          className={inputClassName}
        />
        {errors.email ? (
          <p id="signup-email-error" className="text-sm text-red-600">
            {t("invalidEmail")}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-1">
        <input
          {...register("password")}
          aria-describedby={
            errors.password ? "signup-password-error" : undefined
          }
          aria-invalid={errors.password ? true : undefined}
          aria-label={t("passwordPlaceholder")}
          autoComplete="new-password"
          type="password"
          placeholder={t("passwordPlaceholder")}
          className={inputClassName}
        />
        {errors.password ? (
          <p id="signup-password-error" className="text-sm text-red-600">
            {t("passwordRequired")}
          </p>
        ) : null}
      </div>

      {errors.root?.message ? (
        <p role="alert" className="text-sm text-red-600">
          {errors.root.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-xl bg-emerald-700 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800 disabled:opacity-60"
      >
        {t("submit")}
      </button>
    </form>
  );
}
