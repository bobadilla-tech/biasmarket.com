"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import {
  FormErrorSummary,
  FormField,
  formErrorMessage,
} from "@/components/shared/form-a11y";
import { type AddressInput, addressSchema } from "@biasmarket/validation";

const inputClassName =
  "w-full rounded-xl border border-gray-200 px-4 py-2.5 text-base text-gray-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-gray-600 md:text-sm";

export function AddressForm({
  defaultValues,
  submitting,
  onSubmit,
  onCancel,
}: {
  defaultValues?: Partial<AddressInput>;
  submitting: boolean;
  onSubmit: (values: AddressInput) => Promise<unknown>;
  onCancel: () => void;
}) {
  const t = useTranslations("storefront.accountPage.addresses");
  const tCommon = useTranslations("common");
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<AddressInput>({
    resolver: zodResolver(addressSchema),
    defaultValues: {
      label: defaultValues?.label ?? "",
      recipientName: defaultValues?.recipientName ?? "",
      phone: defaultValues?.phone ?? "",
      line1: defaultValues?.line1 ?? "",
      line2: defaultValues?.line2 ?? "",
      city: defaultValues?.city ?? "",
      region: defaultValues?.region ?? "",
      reference: defaultValues?.reference ?? "",
    },
  });

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(values);
    } catch (err) {
      setError("root", {
        message: err instanceof Error ? err.message : t("genericError"),
      });
    }
  });

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <FormErrorSummary
        id="address-error-summary"
        title={tCommon("formErrorsSummary")}
        messages={[
          errors.recipientName || errors.phone || errors.line1 || errors.city
            ? tCommon("formErrorsSummary")
            : "",
          errors.root?.message ?? "",
        ].filter(Boolean)}
      />
      <FormField id="address-label" label={t("labelPlaceholder")}>
        {(props) => (
          <input
            {...props}
            placeholder={t("labelPlaceholder")}
            className={inputClassName}
            {...register("label")}
          />
        )}
      </FormField>
      <FormField
        id="address-recipient-name"
        label={t("recipientNamePlaceholder")}
        error={formErrorMessage(
          errors.recipientName,
          t("recipientNameRequired"),
        )}
      >
        {(props) => (
          <input
            {...props}
            placeholder={t("recipientNamePlaceholder")}
            className={inputClassName}
            {...register("recipientName")}
          />
        )}
      </FormField>
      <FormField
        id="address-phone"
        label={t("phonePlaceholder")}
        error={formErrorMessage(errors.phone, t("phoneRequired"))}
      >
        {(props) => (
          <input
            {...props}
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            placeholder={t("phonePlaceholder")}
            className={inputClassName}
            {...register("phone")}
          />
        )}
      </FormField>
      <FormField
        id="address-line1"
        label={t("line1Placeholder")}
        error={formErrorMessage(errors.line1, t("line1Required"))}
      >
        {(props) => (
          <input
            {...props}
            autoComplete="street-address"
            placeholder={t("line1Placeholder")}
            className={inputClassName}
            {...register("line1")}
          />
        )}
      </FormField>
      <FormField id="address-line2" label={t("line2Placeholder")}>
        {(props) => (
          <input
            {...props}
            autoComplete="address-line2"
            placeholder={t("line2Placeholder")}
            className={inputClassName}
            {...register("line2")}
          />
        )}
      </FormField>
      <FormField
        id="address-city"
        label={t("cityPlaceholder")}
        error={formErrorMessage(errors.city, t("cityRequired"))}
      >
        {(props) => (
          <input
            {...props}
            autoComplete="address-level2"
            placeholder={t("cityPlaceholder")}
            className={inputClassName}
            {...register("city")}
          />
        )}
      </FormField>
      <FormField id="address-region" label={t("regionPlaceholder")}>
        {(props) => (
          <input
            {...props}
            autoComplete="address-level1"
            placeholder={t("regionPlaceholder")}
            className={inputClassName}
            {...register("region")}
          />
        )}
      </FormField>
      <FormField id="address-reference" label={t("referencePlaceholder")}>
        {(props) => (
          <input
            {...props}
            placeholder={t("referencePlaceholder")}
            className={inputClassName}
            {...register("reference")}
          />
        )}
      </FormField>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
        >
          {submitting ? t("saving") : t("save")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
        >
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}
