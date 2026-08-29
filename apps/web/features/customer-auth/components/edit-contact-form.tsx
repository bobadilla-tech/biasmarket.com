"use client";

import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  FormErrorSummary,
  FormField,
  formErrorMessage,
} from "@/components/shared/form-a11y";
import { useCustomerUpdateProfile } from "../mutations/use-customer-update-profile";
import {
  type EditContactInput,
  editContactSchema,
} from "../schemas/edit-contact.schema";
import type { CustomerProfileResponseDto } from "@biasmarket/types";

const inputClassName =
  "w-full rounded-xl border border-gray-200 px-4 py-2.5 text-base text-gray-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-gray-600 md:text-sm";

export function EditContactForm({
  slug,
  profile,
}: {
  slug: string;
  profile: CustomerProfileResponseDto;
}) {
  const t = useTranslations("storefront.accountPage.editContact");
  const updateProfile = useCustomerUpdateProfile(slug);
  const tCommon = useTranslations("common");
  const [saved, setSaved] = useState(false);

  const {
    register,
    control,
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
        <FormErrorSummary
          id="edit-contact-error-summary"
          title={tCommon("formErrorsSummary")}
          messages={[
            errors.email ? t("emailInvalid") : "",
            errors.phone ? t("phoneRequired") : "",
            errors.root?.message ?? "",
          ].filter(Boolean)}
        />
        <FormField id="edit-contact-name" label={t("namePlaceholder")}>
          {(props) => (
            <input
              {...props}
              autoComplete="name"
              placeholder={t("namePlaceholder")}
              className={inputClassName}
              {...register("name")}
            />
          )}
        </FormField>
        <FormField
          id="edit-contact-email"
          label={t("emailPlaceholder")}
          error={formErrorMessage(errors.email, t("emailInvalid"))}
        >
          {(props) => (
            <input
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
          id="edit-contact-phone"
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
                  countryId="edit-contact-phone-country"
                />
              )}
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
