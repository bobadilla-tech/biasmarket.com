"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useCustomerChangePassword } from "../mutations/use-customer-change-password";
import {
  type CustomerChangePasswordInput,
  customerChangePasswordSchema,
} from "@biasmarket/validation";
import {
  FormErrorSummary,
  FormField,
  formErrorMessage,
} from "@/components/shared/form-a11y";

const inputClassName =
  "w-full rounded-xl border border-gray-200 px-4 py-2.5 text-base text-gray-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-gray-600 md:text-sm";

export function CustomerChangePasswordForm({ slug }: { slug: string }) {
  const t = useTranslations("storefront.accountPage.changePassword");
  const changePassword = useCustomerChangePassword(slug);
  const tCommon = useTranslations("common");
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CustomerChangePasswordInput>({
    resolver: zodResolver(customerChangePasswordSchema),
  });

  const onSubmit = async (values: CustomerChangePasswordInput) => {
    setSaved(false);
    try {
      await changePassword.mutateAsync(values);
      reset();
      setSaved(true);
    } catch (err) {
      setError("root", {
        message: err instanceof Error ? err.message : t("genericError"),
      });
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-gray-900">{t("title")}</h2>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <FormErrorSummary
          id="customer-change-password-error-summary"
          title={tCommon("formErrorsSummary")}
          messages={[
            errors.currentPassword ||
            errors.newPassword ||
            errors.confirmNewPassword
              ? tCommon("formErrorsSummary")
              : "",
            errors.root?.message ?? "",
          ].filter(Boolean)}
        />
        <FormField
          id="customer-change-current-password"
          label={t("currentPasswordPlaceholder")}
          error={formErrorMessage(
            errors.currentPassword,
            t("currentPasswordRequired"),
          )}
        >
          {(props) => (
            <input
              {...props}
              placeholder={t("currentPasswordPlaceholder")}
              type="password"
              autoComplete="current-password"
              className={inputClassName}
              {...register("currentPassword")}
            />
          )}
        </FormField>
        <FormField
          id="customer-change-new-password"
          label={t("newPasswordPlaceholder")}
          error={formErrorMessage(errors.newPassword, t("passwordTooShort"))}
        >
          {(props) => (
            <input
              {...props}
              placeholder={t("newPasswordPlaceholder")}
              type="password"
              autoComplete="new-password"
              className={inputClassName}
              {...register("newPassword")}
            />
          )}
        </FormField>
        <FormField
          id="customer-change-confirm-password"
          label={t("confirmNewPasswordPlaceholder")}
          error={formErrorMessage(
            errors.confirmNewPassword,
            t("passwordsDontMatch"),
          )}
        >
          {(props) => (
            <input
              {...props}
              placeholder={t("confirmNewPasswordPlaceholder")}
              type="password"
              autoComplete="new-password"
              className={inputClassName}
              {...register("confirmNewPassword")}
            />
          )}
        </FormField>
        {saved ? (
          <p className="text-sm text-emerald-600">{t("success")}</p>
        ) : null}

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
