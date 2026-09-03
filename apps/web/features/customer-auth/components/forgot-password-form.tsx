"use client";

import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  FormErrorSummary,
  FormField,
  formErrorMessage,
} from "@/components/shared/form-a11y";
import { useCustomerForgotPassword } from "../mutations/use-customer-forgot-password";
import {
  type ForgotPasswordInput,
  forgotPasswordSchema,
} from "@biasmarket/validation";

const inputClassName =
  "w-full rounded-xl border border-gray-200 px-4 py-2.5 text-base text-gray-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-gray-600 md:text-sm";

export function ForgotPasswordForm({ slug }: { slug: string }) {
  const t = useTranslations("storefront.forgotPasswordPage");
  const forgotPassword = useCustomerForgotPassword(slug);
  const tCommon = useTranslations("common");
  const [success, setSuccess] = useState(false);
  const successRef = useRef<HTMLParagraphElement>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordInput>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { phone: "" },
  });

  const onSubmit = async (values: ForgotPasswordInput) => {
    // Always resolves — the backend never confirms or denies whether a
    // phone number has an account, so there's no failure path to surface.
    await forgotPassword.mutateAsync(values);
    setSuccess(true);
  };

  useEffect(() => {
    if (success) successRef.current?.focus();
  }, [success]);

  if (success) {
    return (
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col gap-4">
        <p
          ref={successRef}
          tabIndex={-1}
          role="status"
          className="text-sm text-gray-700 outline-none"
        >
          {t("success")}
        </p>
        <Link
          href={`/store/${slug}/account/login`}
          className="store-theme-link font-semibold text-center"
        >
          {t("backToLogin")}
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-gray-500">{t("subtitle")}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-5">
        <FormErrorSummary
          id="forgot-password-error-summary"
          title={tCommon("formErrorsSummary")}
          messages={errors.phone ? [tCommon("formErrorsSummary")] : []}
        />
        <FormField
          id="forgot-password-phone"
          label={t("phonePlaceholder")}
          error={formErrorMessage(errors.phone, t("phoneRequired"))}
        >
          {(props) => (
            <Controller
              control={control}
              name="phone"
              render={({ field }) => (
                <PhoneInput
                  {...props}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder={t("phonePlaceholder")}
                  selectClassName={inputClassName}
                  inputClassName={inputClassName}
                  countryId="forgot-password-phone-country"
                />
              )}
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

        <Link
          href={`/store/${slug}/account/login`}
          className="store-theme-link text-center text-sm font-semibold"
        >
          {t("backToLogin")}
        </Link>
      </form>
    </div>
  );
}
