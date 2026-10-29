"use client";

import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ImageIcon, Upload, X } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { limaToday } from "@/lib/lima-date";
import {
  buildSellerPaymentSchema,
  type SellerPaymentInput,
} from "@biasmarket/validation";
import { DuplicateOperationCodeError } from "../api/orders.api";
import { paymentMethodLabels } from "../lib/payment-method-labels";

type SubmitOptions = { confirmDuplicate?: boolean };

export function SellerPaymentForm({
  maxCents,
  hasPendingProof,
  enabledMethods,
  submitting,
  onSubmit,
}: {
  /** What can still be recorded: the balance minus buyer proofs in review. */
  maxCents: number;
  hasPendingProof: boolean;
  enabledMethods: string[];
  submitting: boolean;
  onSubmit: (
    values: SellerPaymentInput,
    options?: SubmitOptions,
  ) => Promise<unknown>;
}) {
  const t = useTranslations("dashboard.orders");
  const { locale, slug } = useParams<{ locale: string; slug: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  // Kept whole (File included) so confirming does not make the seller re-pick.
  const [duplicate, setDuplicate] = useState<{
    orderId: string;
    values: SellerPaymentInput;
  } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const labels = paymentMethodLabels(t);
  const today = limaToday();
  const defaults = (): SellerPaymentInput => ({
    amount: (maxCents / 100).toFixed(2),
    method: "",
    operationCode: "",
    paidAt: today,
    note: "",
    file: null,
  });

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    setValue,
    control,
    reset,
    formState: { errors },
  } = useForm<SellerPaymentInput>({
    resolver: zodResolver(buildSellerPaymentSchema(maxCents, today)),
    defaultValues: defaults(),
  });

  // The balance moves when a payment is recorded or a buyer proof arrives
  // while the form stays mounted (so typed values survive a background
  // refetch): keep the prefill in step unless the seller already edited it.
  const lastPrefill = useRef(maxCents);
  useEffect(() => {
    if (lastPrefill.current === maxCents) return;
    const previous = (lastPrefill.current / 100).toFixed(2);
    lastPrefill.current = maxCents;
    if (getValues("amount") === previous) {
      setValue("amount", (maxCents / 100).toFixed(2));
    }
  }, [maxCents, getValues, setValue]);

  const method = watch("method");
  const file = watch("file");
  const exhausted = maxCents <= 0;

  useEffect(() => {
    if (!(file instanceof File)) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const errorText = (name: keyof SellerPaymentInput) => {
    const key = errors[name]?.message;
    return key ? t(`details.errors.${key}` as never) : null;
  };

  const clear = () => {
    // After a successful save the balance has not refetched yet: the prefill
    // effect above fills the amount once it does.
    reset(defaults());
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const send = async (values: SellerPaymentInput, options?: SubmitOptions) => {
    setSubmitError(null);
    try {
      await onSubmit(values, options);
      setDuplicate(null);
      clear();
    } catch (error) {
      if (error instanceof DuplicateOperationCodeError) {
        setDuplicate({ orderId: error.orderId, values });
        return;
      }
      // Keep the entered values so the seller can retry without retyping.
      setDuplicate(null);
      setSubmitError(error instanceof Error ? error.message : null);
    }
  };

  const submit = handleSubmit((values) => send(values));

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      {hasPendingProof && (
        <p
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
        >
          {t("details.pendingProofHint")}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <label
            htmlFor="payment-amount"
            className="text-xs font-semibold text-[#6e5a87]"
          >
            {t("details.paymentAmountPlaceholder")}
          </label>
          <Input
            id="payment-amount"
            {...register("amount")}
            inputMode="decimal"
            aria-invalid={Boolean(errors.amount)}
            className="store-theme-input h-11 rounded-xl border-[#e7dcf3] bg-[#fbf8fe] shadow-none"
          />
          {errorText("amount") && (
            <p role="alert" className="text-xs text-rose-600">
              {errorText("amount")}
            </p>
          )}
        </div>
        <div className="space-y-1">
          <label
            htmlFor="payment-date"
            className="text-xs font-semibold text-[#6e5a87]"
          >
            {t("details.paidAt")}
          </label>
          <Input
            id="payment-date"
            type="date"
            max={today}
            {...register("paidAt")}
            aria-invalid={Boolean(errors.paidAt)}
            className="store-theme-input h-11 rounded-xl border-[#e7dcf3] bg-[#fbf8fe] shadow-none"
          />
          {errorText("paidAt") && (
            <p role="alert" className="text-xs text-rose-600">
              {errorText("paidAt")}
            </p>
          )}
        </div>
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
      {errorText("method") && (
        <p role="alert" className="text-xs text-rose-600">
          {errorText("method")}
        </p>
      )}

      <div className="space-y-1">
        <Input
          {...register("operationCode")}
          aria-label={t("details.operationCode")}
          placeholder={t("details.operationCode")}
          autoComplete="off"
          maxLength={64}
          className="store-theme-input h-11 rounded-xl border-[#e7dcf3] bg-[#fbf8fe] shadow-none"
        />
        {errorText("operationCode") && (
          <p role="alert" className="text-xs text-rose-600">
            {errorText("operationCode")}
          </p>
        )}
      </div>
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

          <div className="min-w-0 flex-1">
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
                  {method && method !== "CASH" ? " *" : ""}
                </p>
                <p className="text-xs text-[#8f7da8]">
                  {method === "CASH"
                    ? t("details.captureOptionalForCash")
                    : t("details.uploadPaymentImageHint")}
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
        {errorText("file") && (
          <p role="alert" className="text-xs text-rose-600">
            {errorText("file")}
          </p>
        )}

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
              aria-label={t("details.removeImage")}
              className="size-8 rounded-full p-0 text-[#b24368] hover:bg-[#fff0f5]"
              onClick={() => {
                reset({ ...watch(), file: null });
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            >
              <X className="size-4" />
            </Button>
          </div>
        )}
      </div>

      {submitError && (
        <p role="alert" className="text-sm text-rose-600">
          {submitError}
        </p>
      )}

      <Button
        type="submit"
        disabled={submitting || exhausted}
        className="store-theme-primary-button h-11 w-full rounded-xl px-5 text-sm font-semibold hover:opacity-100"
      >
        {t("details.registerPayment")}
      </Button>

      <AlertDialog
        open={duplicate !== null}
        onOpenChange={(open) => {
          if (!open) setDuplicate(null);
        }}
      >
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("details.duplicate.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("details.duplicate.body")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {duplicate && (
            <a
              href={`/${locale}/dashboard/${slug}/orders?order=${duplicate.orderId}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-[var(--store-primary)] underline"
            >
              {t("details.duplicate.viewOrder")}
            </a>
          )}
          <AlertDialogFooter>
            <AlertDialogClose render={<Button variant="ghost" />}>
              {t("details.duplicate.cancel")}
            </AlertDialogClose>
            <Button
              type="button"
              disabled={submitting}
              onClick={() =>
                duplicate &&
                void send(duplicate.values, { confirmDuplicate: true })
              }
            >
              {t("details.duplicate.confirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  );
}
