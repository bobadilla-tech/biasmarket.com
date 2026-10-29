"use client";

import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { ImageIcon, Upload, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { ApiError } from "@biasmarket/types";
import type { PublicOrderResponseDto } from "@biasmarket/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useSubmitPublicProof } from "../mutations/use-submit-public-proof";
import {
  buildSubmitProofSchema,
  PROOF_METHODS,
  type SubmitProofInput,
} from "../schemas/submit-proof.schema";
import { submittableCents } from "../lib/order-state";

export function ProofUploadForm({
  token,
  order,
}: {
  token: string;
  order: PublicOrderResponseDto;
}) {
  const t = useTranslations("storefront.publicOrder.upload");
  const tMethods = useTranslations("storefront.checkoutPage");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const maxCents = submittableCents(order);
  const mutation = useSubmitPublicProof(token, t("errors.generic"));

  // Only methods the store configured; a CASH proof makes no sense for a
  // bank transfer image but the server accepts it, so the list is the store's.
  const methods = order.paymentMethods
    .map((config) => config.method)
    .filter((method) => (PROOF_METHODS as readonly string[]).includes(method));

  const {
    register,
    handleSubmit,
    control,
    watch,
    reset,
    setError,
    formState: { errors },
  } = useForm<SubmitProofInput>({
    resolver: zodResolver(buildSubmitProofSchema(maxCents)),
    defaultValues: {
      amount: (maxCents / 100).toFixed(2),
      method: undefined,
      operationCode: "",
      file: null,
    },
  });

  const file = watch("file");
  useEffect(() => {
    if (!(file instanceof File)) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // The balance moves after every upload or seller action: keep the prefill
  // in step unless the buyer already edited it.
  const lastPrefill = useRef(maxCents);
  const amount = watch("amount");
  useEffect(() => {
    if (lastPrefill.current === maxCents) return;
    if (amount === (lastPrefill.current / 100).toFixed(2)) {
      reset((values) => ({ ...values, amount: (maxCents / 100).toFixed(2) }));
    }
    lastPrefill.current = maxCents;
  }, [maxCents, amount, reset]);

  const fieldError = (name: keyof SubmitProofInput) => {
    const key = errors[name]?.message;
    return key ? t(`errors.${key}` as Parameters<typeof t>[0]) : null;
  };

  const submit = handleSubmit(async (values) => {
    setSent(false);
    try {
      await mutation.mutateAsync(values);
      setSent(true);
      reset({
        amount: (maxCents / 100).toFixed(2),
        method: undefined,
        operationCode: "",
        file: null,
      });
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (error) {
      // Keep the entered values so the buyer can retry without retyping.
      let message = t("errors.generic");
      if (error instanceof ApiError) {
        if (error.status === 413) message = t("errors.tooLarge");
        else if (error.status === 404) message = t("errors.invalid");
        else if (error.status === 429) message = t("errors.rateLimited");
        else if (error.status === 400) message = error.message;
      }
      setError("root", { message });
    }
  });

  // The page already tells the buyer to contact the store in this case; a
  // form with an empty method select could never be submitted.
  if (methods.length === 0) return null;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <label
          htmlFor="proof-amount"
          className="text-xs font-semibold text-gray-700"
        >
          {t("amount")} ({order.currency})
        </label>
        <Input
          id="proof-amount"
          {...register("amount")}
          inputMode="decimal"
          aria-invalid={Boolean(errors.amount)}
          className="h-11 rounded-xl"
        />
        {fieldError("amount") && (
          <p role="alert" className="text-xs text-rose-600">
            {fieldError("amount")}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="proof-method"
          className="text-xs font-semibold text-gray-700"
        >
          {t("method")}
        </label>
        <Select
          id="proof-method"
          {...register("method")}
          defaultValue=""
          selectClassName="h-11 rounded-xl text-sm"
        >
          <option value="" disabled>
            {t("selectMethod")}
          </option>
          {methods.map((method) => (
            <option key={method} value={method}>
              {tMethods(`paymentMethodLabels.${method}`)}
            </option>
          ))}
        </Select>
        {fieldError("method") && (
          <p role="alert" className="text-xs text-rose-600">
            {fieldError("method")}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="proof-code"
          className="text-xs font-semibold text-gray-700"
        >
          {t("code")}
        </label>
        <Input
          id="proof-code"
          {...register("operationCode")}
          autoComplete="off"
          maxLength={64}
          className="h-11 rounded-xl"
        />
        <p className="text-xs text-gray-500">{t("codeHint")}</p>
        {fieldError("operationCode") && (
          <p role="alert" className="text-xs text-rose-600">
            {fieldError("operationCode")}
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Controller
          control={control}
          name="file"
          render={({ field }) => (
            <input
              ref={fileInputRef}
              id="proof-file"
              type="file"
              accept="image/png,image/jpeg"
              className="sr-only"
              aria-label={t("chooseFile")}
              onChange={(event) =>
                field.onChange(event.target.files?.[0] ?? null)
              }
            />
          )}
        />
        <label
          htmlFor="proof-file"
          className="flex cursor-pointer items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-gray-50 px-4 py-3"
        >
          {file ? (
            <ImageIcon aria-hidden="true" className="size-5 shrink-0" />
          ) : (
            <Upload aria-hidden="true" className="size-5 shrink-0" />
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-gray-900">
              {file ? file.name : t("chooseFile")}
            </span>
            <span className="block text-xs text-gray-500">{t("fileHint")}</span>
          </span>
        </label>
        {file && previewUrl && (
          <div className="flex items-center justify-between rounded-xl border border-gray-100 p-2">
            <img
              src={previewUrl}
              alt={t("preview")}
              className="size-14 rounded-lg object-cover"
            />
            <Button
              type="button"
              variant="ghost"
              aria-label={t("removeFile")}
              className="size-8 rounded-full p-0"
              onClick={() => {
                reset({ ...watch(), file: null });
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            >
              <X className="size-4" />
            </Button>
          </div>
        )}
        {fieldError("file") && (
          <p role="alert" className="text-xs text-rose-600">
            {fieldError("file")}
          </p>
        )}
      </div>

      {errors.root?.message && (
        <p role="alert" className="text-sm text-rose-600">
          {errors.root.message}
        </p>
      )}
      {sent && (
        <p role="status" className="text-sm font-semibold text-emerald-700">
          {t("success")}
        </p>
      )}

      <Button
        type="submit"
        disabled={mutation.isPending}
        className="h-11 w-full rounded-xl text-sm font-semibold"
      >
        {mutation.isPending ? t("submitting") : t("submit")}
      </Button>
    </form>
  );
}
