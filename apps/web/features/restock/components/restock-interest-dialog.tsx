"use client";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { X } from "lucide-react";
import { PhoneInput } from "@/components/ui/phone-input";
import { useRequestRestock } from "../mutations/use-request-restock";
import {
  restockRequestFormSchema,
  type RestockRequestFormInput,
} from "../schemas/restock-request.schema";

const inputClassName =
  "store-theme-input rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none";

interface RestockInterestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  slug: string;
  productId: string;
  variantId?: string;
  productName: string;
  variantLabel?: string;
}

export function RestockInterestDialog({
  open,
  onOpenChange,
  slug,
  productId,
  variantId,
  productName,
  variantLabel,
}: RestockInterestDialogProps) {
  const t = useTranslations("storefront.restockDialog");
  const requestRestock = useRequestRestock(slug);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState,
  } = useForm<RestockRequestFormInput>({
    resolver: zodResolver(restockRequestFormSchema),
    defaultValues: { name: "", phone: "" },
  });

  // Deliberately excludes the `useMutation` result object from the deps: it is
  // recreated on every render (`{ ...result, mutate }`), so including it would
  // re-run the effect after each `reset()` state update and loop forever
  // ("Maximum update depth exceeded"). `reset` and `requestRestock.reset` are
  // stable function references, so the effect only runs when `open` changes.
  useEffect(() => {
    if (open) {
      reset({ name: "", phone: "" });
      requestRestock.reset();
    }
  }, [open, reset, requestRestock.reset]);

  if (!open) return null;

  const submit = handleSubmit(async (values) => {
    await requestRestock.mutateAsync({ ...values, productId, variantId });
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !requestRestock.isPending && onOpenChange(false)}
      />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <button
          type="button"
          aria-label={t("close")}
          onClick={() => onOpenChange(false)}
          className="absolute right-4 top-4 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="size-4" />
        </button>

        {requestRestock.isSuccess
          ? (
            <div className="py-4 text-center">
              <h3 className="text-lg font-bold text-gray-900">
                {t("successTitle")}
              </h3>
              <p className="mt-2 text-sm text-gray-600">{t("successBody")}</p>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="store-theme-primary-button mt-5 rounded-xl px-5 py-2.5 text-sm font-semibold"
              >
                {t("close")}
              </button>
            </div>
          )
          : (
            <>
              <h3 className="text-lg font-bold text-gray-900">{t("title")}</h3>
              <p className="mt-1 text-sm text-gray-600">{t("subtitle")}</p>
              <p className="mt-3 rounded-xl bg-gray-50 px-4 py-3 text-sm font-semibold text-gray-900">
                {productName}
                {variantLabel ? ` — ${variantLabel}` : ""}
              </p>

              <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
                <div>
                  <input
                    placeholder={t("namePlaceholder")}
                    className={inputClassName}
                    {...register("name")}
                  />
                  {formState.errors.name && (
                    <p className="mt-1 text-sm text-red-500">
                      {t("nameRequired")}
                    </p>
                  )}
                </div>
                <div>
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
                  {formState.errors.phone && (
                    <p className="mt-1 text-sm text-red-500">
                      {t("phoneRequired")}
                    </p>
                  )}
                </div>

                {requestRestock.error && (
                  <p className="text-sm text-red-500">{t("error")}</p>
                )}

                <button
                  type="submit"
                  disabled={requestRestock.isPending}
                  className="store-theme-primary-button mt-2 rounded-xl px-5 py-3 text-sm font-semibold transition disabled:opacity-60"
                >
                  {requestRestock.isPending ? t("submitting") : t("submit")}
                </button>
              </form>
            </>
          )}
      </div>
    </div>
  );
}
