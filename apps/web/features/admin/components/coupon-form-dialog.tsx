"use client";

import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto bg-white">
        <DialogHeader>
          <DialogTitle className="text-lg font-semibold text-gray-900">
            {initialValues ? t("editTitle") : t("createTitle")}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {initialValues ? t("editTitle") : t("createTitle")}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="grid gap-4 md:grid-cols-2"
        >
          <label
            htmlFor="coupon-code"
            className="flex flex-col gap-1 text-sm text-gray-700"
          >
            <span>{t("form.code")}</span>
            <input
              id="coupon-code"
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

          <label
            htmlFor="coupon-name"
            className="flex flex-col gap-1 text-sm text-gray-700"
          >
            <span>{t("form.name")}</span>
            <input
              id="coupon-name"
              {...form.register("name")}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
            {form.formState.errors.name && (
              <span className="text-xs text-red-500">
                {form.formState.errors.name.message}
              </span>
            )}
          </label>

          <label
            htmlFor="coupon-description"
            className="flex flex-col gap-1 text-sm text-gray-700 md:col-span-2"
          >
            <span>{t("form.description")}</span>
            <input
              id="coupon-description"
              {...form.register("description")}
              className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
            />
          </label>

          <label
            htmlFor="coupon-max-uses"
            className="flex flex-col gap-1 text-sm text-gray-700"
          >
            <span>{t("form.maxUses")}</span>
            <input
              id="coupon-max-uses"
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
            <label
              htmlFor="coupon-starts-at"
              className="flex flex-col gap-1 text-sm text-gray-700"
            >
              <span>{t("form.startsAt")}</span>
              <input
                id="coupon-starts-at"
                type="date"
                {...form.register("startsAt")}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </label>

            <label
              htmlFor="coupon-expires-at"
              className="flex flex-col gap-1 text-sm text-gray-700"
            >
              <span>{t("form.expiresAt")}</span>
              <input
                id="coupon-expires-at"
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
      </DialogContent>
    </Dialog>
  );
}
