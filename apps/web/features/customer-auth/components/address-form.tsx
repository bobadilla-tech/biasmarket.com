"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { addressSchema, type AddressInput } from "../schemas/address.schema";

const inputClassName =
  "w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100 placeholder:text-gray-600";

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
      <input
        placeholder={t("labelPlaceholder")}
        className={inputClassName}
        {...register("label")}
      />
      <div className="flex flex-col gap-1.5">
        <input
          placeholder={t("recipientNamePlaceholder")}
          className={inputClassName}
          {...register("recipientName")}
        />
        {errors.recipientName
          ? (
            <p className="text-sm text-red-500">
              {t("recipientNameRequired")}
            </p>
          )
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
      <div className="flex flex-col gap-1.5">
        <input
          placeholder={t("line1Placeholder")}
          className={inputClassName}
          {...register("line1")}
        />
        {errors.line1
          ? <p className="text-sm text-red-500">{t("line1Required")}</p>
          : null}
      </div>
      <input
        placeholder={t("line2Placeholder")}
        className={inputClassName}
        {...register("line2")}
      />
      <div className="flex flex-col gap-1.5">
        <input
          placeholder={t("cityPlaceholder")}
          className={inputClassName}
          {...register("city")}
        />
        {errors.city
          ? <p className="text-sm text-red-500">{t("cityRequired")}</p>
          : null}
      </div>
      <input
        placeholder={t("regionPlaceholder")}
        className={inputClassName}
        {...register("region")}
      />
      <input
        placeholder={t("referencePlaceholder")}
        className={inputClassName}
        {...register("reference")}
      />
      {errors.root
        ? <p className="text-sm text-red-500">{errors.root.message}</p>
        : null}
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
