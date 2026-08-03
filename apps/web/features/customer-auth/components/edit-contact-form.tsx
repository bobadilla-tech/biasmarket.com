"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useCustomerUpdateProfile } from "../mutations/use-customer-update-profile";
import {
  type EditContactInput,
  editContactSchema,
} from "../schemas/edit-contact.schema";
import type { CustomerProfile } from "../schemas/profile.schema";

const inputClassName =
  "w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-gray-600";

export function EditContactForm(
  { slug, profile }: { slug: string; profile: CustomerProfile },
) {
  const t = useTranslations("storefront.accountPage.editContact");
  const updateProfile = useCustomerUpdateProfile(slug);
  const [saved, setSaved] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EditContactInput>({
    resolver: zodResolver(editContactSchema),
    defaultValues: {
      name: profile.customer.name ?? "",
      email: profile.customer.email ?? "",
      phone: profile.customer.phone,
    },
  });

  const onSubmit = async (values: EditContactInput) => {
    setSaved(false);
    try {
      await updateProfile.mutateAsync(values);
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

      {profile.customer.pendingEmail && (
        <p className="text-xs text-amber-600">
          {t("pendingEmail", { email: profile.customer.pendingEmail })}
        </p>
      )}
      {profile.customer.pendingPhone && (
        <p className="text-xs text-amber-600">
          {t("pendingPhone", { phone: profile.customer.pendingPhone })}
        </p>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <input
            placeholder={t("namePlaceholder")}
            className={inputClassName}
            {...register("name")}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <input
            placeholder={t("emailPlaceholder")}
            className={inputClassName}
            {...register("email")}
          />
          {errors.email
            ? <p className="text-sm text-red-500">{t("emailInvalid")}</p>
            : null}
        </div>

        <div className="flex flex-col gap-1.5">
          <input
            placeholder={t("phonePlaceholder")}
            className={inputClassName}
            {...register("phone")}
          />
          {errors.phone
            ? <p className="text-sm text-red-500">{t("phoneRequired")}</p>
            : null}
        </div>

        {errors.root
          ? <p className="text-sm text-red-500">{errors.root.message}</p>
          : null}
        {saved
          ? <p className="text-sm text-emerald-600">{t("success")}</p>
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
