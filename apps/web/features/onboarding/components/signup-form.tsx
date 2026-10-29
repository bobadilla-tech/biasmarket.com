"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { useRouter } from "@/i18n/navigation";
import { type SignupInput, signupSchema } from "../schemas/signup.schema";

const inputClassName =
  "w-full rounded-xl rounded-xl border border-[#d9d2e9] bg-white/85 px-4 py-3 text-base text-[#27213b] outline-none transition placeholder:text-[#827995] focus:border-[#8761d9] focus:ring-2 focus:ring-[#c8b5f5]/60 md:text-sm";

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

  const onGoogle = async () => {
    const { error } = await authClient.signIn.social({
      provider: "google",
      callbackURL: `${globalThis.location.origin}/${locale}/verify-email`,
      errorCallbackURL: `${globalThis.location.origin}/${locale}/auth/error`,
    });
    if (error) {
      setError("root", { message: error.message ?? t("googleError") });
    }
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
        className="min-h-12 w-full rounded-xl bg-gradient-to-r from-[#7953d5] via-[#9163e6] to-[#a56be9] py-3 text-sm font-semibold text-white shadow-[0_9px_22px_rgba(123,80,206,0.25)] transition hover:-translate-y-0.5 hover:brightness-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7048cf] focus-visible:ring-offset-2 disabled:opacity-60"
      >
        {t("submit")}
      </button>

      <button
        type="button"
        onClick={onGoogle}
        className="min-h-11 w-full rounded-xl border border-border py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/25 hover:bg-secondary"
      >
        {t("google")}
      </button>
    </form>
  );
}
