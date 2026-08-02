"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useCustomerChangePassword } from "../mutations/use-customer-change-password";
import {
  customerChangePasswordSchema,
  type CustomerChangePasswordInput,
} from "../schemas/change-password.schema";

const inputClassName =
  "w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-gray-600";

export function CustomerChangePasswordForm({ slug }: { slug: string }) {
  const t = useTranslations("storefront.accountPage.changePassword");
  const changePassword = useCustomerChangePassword(slug);
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CustomerChangePasswordInput>({ resolver: zodResolver(customerChangePasswordSchema) });

  const onSubmit = async (values: CustomerChangePasswordInput) => {
    setSaved(false);
    try {
      await changePassword.mutateAsync(values);
      reset();
      setSaved(true);
    } catch (err) {
      setError("root", { message: err instanceof Error ? err.message : t("genericError") });
    }
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-4">
      <h2 className="text-sm font-semibold text-gray-900">{t("title")}</h2>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <input
            placeholder={t("currentPasswordPlaceholder")}
            type="password"
            className={inputClassName}
            {...register("currentPassword")}
          />
          {errors.currentPassword ? (
            <p className="text-sm text-red-500">{t("currentPasswordRequired")}</p>
          ) : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <input
            placeholder={t("newPasswordPlaceholder")}
            type="password"
            className={inputClassName}
            {...register("newPassword")}
          />
          {errors.newPassword ? <p className="text-sm text-red-500">{t("passwordTooShort")}</p> : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <input
            placeholder={t("confirmNewPasswordPlaceholder")}
            type="password"
            className={inputClassName}
            {...register("confirmNewPassword")}
          />
          {errors.confirmNewPassword ? (
            <p className="text-sm text-red-500">{t("passwordsDontMatch")}</p>
          ) : null}
        </div>

        {errors.root ? <p className="text-sm text-red-500">{errors.root.message}</p> : null}
        {saved ? <p className="text-sm text-emerald-600">{t("success")}</p> : null}

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
