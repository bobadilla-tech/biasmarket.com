"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { PhoneInput } from "@/components/ui/phone-input";
import { useCustomerForgotPassword } from "../mutations/use-customer-forgot-password";
import {
  type ForgotPasswordInput,
  forgotPasswordSchema,
} from "../schemas/forgot-password.schema";

const inputClassName =
  "w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-gray-600";

export function ForgotPasswordForm({ slug }: { slug: string }) {
  const t = useTranslations("storefront.forgotPasswordPage");
  const forgotPassword = useCustomerForgotPassword(slug);
  const [success, setSuccess] = useState(false);

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

  if (success) {
    return (
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col gap-4">
        <p className="text-sm text-gray-700">{t("success")}</p>
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
        <div className="flex flex-col gap-1.5">
          <Controller
            control={control}
            name="phone"
            render={({ field }) => (
              <PhoneInput
                value={field.value}
                onChange={field.onChange}
                placeholder={t("phonePlaceholder")}
                selectClassName={inputClassName}
                inputClassName={inputClassName}
              />
            )}
          />
          {errors.phone
            ? <p className="text-sm text-red-500">{t("phoneRequired")}</p>
            : null}
        </div>

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
