"use client";

import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ImageIcon, Upload, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  buildRegisterPaymentSchema,
  type RegisterPaymentInput,
} from "../schemas/register-payment.schema";
import { paymentMethodLabels } from "../lib/payment-method-labels";

export function RegisterPaymentForm({
  pendingAmount,
  enabledMethods,
  submitting,
  onSubmit,
}: {
  pendingAmount: number;
  enabledMethods: string[];
  submitting: boolean;
  onSubmit: (values: RegisterPaymentInput) => Promise<unknown>;
}) {
  const t = useTranslations("dashboard.orders");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const labels = paymentMethodLabels(t);

  const { register, handleSubmit, watch, control, reset } =
    useForm<RegisterPaymentInput>({
      resolver: zodResolver(buildRegisterPaymentSchema(pendingAmount)),
      defaultValues: { amount: "", method: "", note: "", file: null },
    });

  const amount = watch("amount");
  const method = watch("method");
  const file = watch("file");

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const submit = handleSubmit(async (values) => {
    try {
      await onSubmit(values);
      reset({ amount: "", method: "", note: "", file: null });
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch {
      // Keep the entered values so the seller can retry without retyping.
    }
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          {...register("amount")}
          inputMode="decimal"
          placeholder={t("details.paymentAmountPlaceholder")}
          className="store-theme-input h-11 rounded-xl border-[#e7dcf3] bg-[#fbf8fe] shadow-none"
        />
        <Button
          type="button"
          onClick={submit}
          disabled={submitting || pendingAmount <= 0 || !amount || !method}
          className="store-theme-primary-button h-11 shrink-0 rounded-xl px-5 text-sm font-semibold hover:opacity-100"
        >
          {t("details.registerPayment")}
        </Button>
      </div>
      <Select
        {...register("method")}
        aria-label={t("details.selectPaymentMethod")}
        selectClassName="store-theme-input h-11 rounded-xl border-[#e7dcf3] bg-[#fbf8fe] text-sm text-[#341b55]"
      >
        <option value="" disabled>
          {t("details.selectPaymentMethod")}
        </option>
        {enabledMethods.map((methodOption) => (
          <option key={methodOption} value={methodOption}>
            {labels[methodOption] ?? methodOption}
          </option>
        ))}
      </Select>
      <Input
        {...register("note")}
        aria-label={t("details.paymentNotePlaceholder")}
        placeholder={t("details.paymentNotePlaceholder")}
        className="store-theme-input h-11 rounded-xl border-[#e7dcf3] bg-[#fbf8fe] shadow-none"
      />
      <div className="space-y-2">
        <Controller
          control={control}
          name="file"
          render={({ field }) => (
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg"
              className="hidden"
              id="payment-image-upload"
              aria-label={t("details.uploadPaymentImage")}
              onChange={(event) =>
                field.onChange(event.target.files?.[0] ?? null)
              }
            />
          )}
        />

        <label
          htmlFor="payment-image-upload"
          className={cn(
            "flex cursor-pointer items-center justify-center gap-3 rounded-xl border border-dashed px-4 py-3 transition",
            "border-[#d9c7ee] bg-[#fbf8fe] hover:bg-[#f7f0ff]",
            file && "border-[var(--store-primary)] bg-[#faf5ff]",
          )}
        >
          <div className="flex size-9 items-center justify-center rounded-full bg-[#f0e7f8]">
            {file ? (
              <ImageIcon className="size-4 text-[var(--store-primary)]" />
            ) : (
              <Upload className="size-4 text-[var(--store-primary)]" />
            )}
          </div>

          <div className="flex-1">
            {file ? (
              <>
                <p className="truncate text-sm font-semibold text-[#2d1649]">
                  {file.name}
                </p>
                <p className="text-xs text-[#8f7da8]">
                  {t("details.imageSize", {
                    size: (file.size / 1024).toFixed(1),
                  })}
                </p>
              </>
            ) : (
              <>
                <p className="text-sm font-semibold text-[#2d1649]">
                  {t("details.uploadPaymentImage")}
                </p>
                <p className="text-xs text-[#8f7da8]">
                  {t("details.uploadPaymentImageHint")}
                </p>
              </>
            )}
          </div>

          {!file && (
            <span className="rounded-full bg-[var(--store-primary)] px-3 py-1 text-xs font-semibold text-white">
              {t("details.chooseImage")}
            </span>
          )}
        </label>

        {file && previewUrl && (
          <div className="flex items-center justify-between rounded-xl border border-[#f0e7f8] bg-white p-2">
            <div className="flex items-center gap-3">
              <img
                src={previewUrl}
                alt=""
                className="size-12 rounded-lg object-cover"
              />
              <span className="text-xs text-[#8f7da8]">
                {t("details.imagePreview")}
              </span>
            </div>

            <Button
              type="button"
              variant="ghost"
              className="size-8 rounded-full p-0 text-[#b24368] hover:bg-[#fff0f5]"
              onClick={() => {
                reset({ amount, method, note: watch("note"), file: null });
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            >
              <X className="size-4" />
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
