"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useCustomerRegister } from "../mutations/use-customer-register";
import {
  FormErrorSummary,
  FormField,
  formErrorMessage,
} from "@/components/shared/form-a11y";
import {
  type CustomerRegisterInput,
  customerRegisterSchema,
} from "../schemas/register.schema";

const inputClassName =
  "w-full rounded-xl border border-gray-200 px-4 py-2.5 text-base text-gray-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-gray-600 md:text-sm";

// Folded into the confirm page rather than a separate /register route (the
// magic-link token needed as proof of email ownership is already loaded
// here) — see docs/plans/2026-08-02-buyer-accounts-phase12-plan.md,
// "Frontend". `purpose` controls copy only — the backend's `register` call
// (reused for both "confirm" and "reset" token purposes) branches on the
// token itself, not on anything this form sends.
export function SetPasswordForm({
  slug,
  token,
  purpose = "confirm",
}: {
  slug: string;
  token: string;
  purpose?: "confirm" | "reset";
}) {
  const t = useTranslations("storefront.accountConfirmPage.setPassword");
  const register_ = useCustomerRegister(slug);
  const tCommon = useTranslations("common");
  const [success, setSuccess] = useState(false);
  const successRef = useRef<HTMLParagraphElement>(null);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CustomerRegisterInput>({
    resolver: zodResolver(customerRegisterSchema),
  });

  const onSubmit = async (values: CustomerRegisterInput) => {
    try {
      await register_.mutateAsync({ token, password: values.password });
      setSuccess(true);
    } catch (err) {
      setError("root", {
        message: err instanceof Error ? err.message : undefined,
      });
    }
  };

  useEffect(() => {
    if (success) successRef.current?.focus();
  }, [success]);

  if (success) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-3">
        <p
          ref={successRef}
          tabIndex={-1}
          role="status"
          className="text-sm text-gray-700 outline-none"
        >
          {purpose === "reset" ? t("successReset") : t("success")}
        </p>
        <Link
          href={`/store/${slug}/account/login`}
          className="store-theme-link font-semibold text-center"
        >
          {t("goToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">
          {purpose === "reset" ? t("titleReset") : t("title")}
        </h2>
        <p className="mt-1 text-xs text-gray-500">
          {purpose === "reset" ? t("subtitleReset") : t("subtitle")}
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormErrorSummary
          id="set-password-error-summary"
          title={tCommon("formErrorsSummary")}
          messages={[
            errors.password || errors.confirmPassword
              ? tCommon("formErrorsSummary")
              : "",
            errors.root?.message ?? "",
          ].filter(Boolean)}
        />
        <FormField
          id="set-password-password"
          label={t("passwordPlaceholder")}
          error={formErrorMessage(errors.password, t("passwordTooShort"))}
        >
          {(props) => (
            <input
              {...props}
              placeholder={t("passwordPlaceholder")}
              type="password"
              autoComplete="new-password"
              className={inputClassName}
              {...register("password")}
            />
          )}
        </FormField>

        <FormField
          id="set-password-confirm"
          label={t("confirmPasswordPlaceholder")}
          error={formErrorMessage(
            errors.confirmPassword,
            t("passwordsDontMatch"),
          )}
        >
          {(props) => (
            <input
              {...props}
              placeholder={t("confirmPasswordPlaceholder")}
              type="password"
              autoComplete="new-password"
              className={inputClassName}
              {...register("confirmPassword")}
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
    </div>
  );
}
