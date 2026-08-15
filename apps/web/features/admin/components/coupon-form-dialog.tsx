"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import {
  couponFormSchema,
  type CouponFormValues,
} from "../schemas/coupon.schema";

const blankFormValues: CouponFormValues = {
  code: "",
  name: "",
  description: "",
  maxUses: 1,
  startsAt: "",
  expiresAt: "",
};

interface CouponFormDialogProps {
  open: boolean;
  initialValues?: CouponFormValues;
  isSubmitting: boolean;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (values: CouponFormValues) => void;
}

export function CouponFormDialog({
  open,
  initialValues,
  isSubmitting,
  submitLabel,
  onClose,
  onSubmit,
}: CouponFormDialogProps) {
  const t = useTranslations("admin.coupons");
  const tCommon = useTranslations("common");

  const form = useForm<CouponFormValues>({
    resolver: zodResolver(couponFormSchema),
    defaultValues: blankFormValues,
  });

  useEffect(() => {
    if (open) {
      form.reset(
        initialValues
          ? { ...blankFormValues, ...initialValues }
          : blankFormValues,
      );
    }
  }, [open, initialValues, form]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-100 bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900">
            {initialValues ? "Edit coupon" : t("createTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-gray-500 transition hover:bg-gray-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid gap-4 md:grid-cols-2"
        >
          <label className="flex flex-col gap-1 text-sm text-gray-700">
            <span>{t("form.code")}</span>
            <input
              {...form.register("code")}
              maxLength={8}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm uppercase"
              placeholder="PREMIUM"
            />
            {form.formState.errors.code && (
              <span className="text-xs text-red-500">
                {form.formState.errors.code.message}
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1 text-sm text-gray-700">
            <span>{t("form.name")}</span>
            <input
              {...form.register("name")}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
            {form.formState.errors.name && (
              <span className="text-xs text-red-500">
                {form.formState.errors.name.message}
              </span>
            )}
          </label>

          <label className="flex flex-col gap-1 text-sm text-gray-700 md:col-span-2">
            <span>{t("form.description")}</span>
            <input
              {...form.register("description")}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm text-gray-700">
            <span>{t("form.maxUses")}</span>
            <input
              type="number"
              min={1}
              {...form.register("maxUses", { valueAsNumber: true })}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
            {form.formState.errors.maxUses && (
              <span className="text-xs text-red-500">
                {form.formState.errors.maxUses.message}
              </span>
            )}
          </label>

          <div className="md:col-span-2 grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-gray-700">
              <span>{t("form.startsAt")}</span>
              <input
                type="date"
                {...form.register("startsAt")}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-gray-700">
              <span>{t("form.expiresAt")}</span>
              <input
                type="date"
                {...form.register("expiresAt")}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </label>
          </div>

          <div className="md:col-span-2 flex items-center justify-between gap-3">
            <div className="text-sm text-gray-500">
              Premium plan: 30 days (1 month)
            </div>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-700 disabled:opacity-60"
            >
              {isSubmitting ? tCommon("loading") : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
