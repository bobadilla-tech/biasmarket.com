"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useCustomerRegister } from "../mutations/use-customer-register";
import {
  type CustomerRegisterInput,
  customerRegisterSchema,
} from "../schemas/register.schema";

const inputClassName =
  "w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-gray-600";

// Folded into the confirm page rather than a separate /register route (the
// magic-link token needed as proof of email ownership is already loaded
// here) — see docs/plans/2026-08-02-buyer-accounts-phase12-plan.md,
// "Frontend". Always shown regardless of whether a password was already
// set: the confirm-account response doesn't currently say either way, so a
// customer revisiting an old confirmation link after already registering
// just sees the backend's "already has a password" error on submit instead
// of the CTA being hidden upfront.
export function SetPasswordForm(
  { slug, token }: { slug: string; token: string },
) {
  const t = useTranslations("storefront.accountConfirmPage.setPassword");
  const register_ = useCustomerRegister(slug);
  const [success, setSuccess] = useState(false);

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

  if (success) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-3">
        <p className="text-sm text-gray-700">{t("success")}</p>
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
        <h2 className="text-sm font-semibold text-gray-900">{t("title")}</h2>
        <p className="mt-1 text-xs text-gray-500">{t("subtitle")}</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <input
            placeholder={t("passwordPlaceholder")}
            type="password"
            className={inputClassName}
            {...register("password")}
          />
          {errors.password
            ? <p className="text-sm text-red-500">{t("passwordTooShort")}</p>
            : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <input
            placeholder={t("confirmPasswordPlaceholder")}
            type="password"
            className={inputClassName}
            {...register("confirmPassword")}
          />
          {errors.confirmPassword
            ? <p className="text-sm text-red-500">{t("passwordsDontMatch")}</p>
            : null}
        </div>

        {errors.root
          ? (
            <p className="text-sm text-red-500">
              {errors.root.message ?? t("genericError")}
            </p>
          )
          : null}

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
