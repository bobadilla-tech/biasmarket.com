"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { FileText, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";

// Proof-of-payment file picker for the checkout step. Like the seller
// dashboard's register-payment upload, image proofs get a live thumbnail
// preview (object URL, revoked on change/unmount); PDF proofs render as the
// file name + size row instead, since the browser can't thumbnail them. The
// upload field only appears for manual payment methods (see
// checkout-form.tsx); `onChange(null)` clears the choice, which the schema
// turns into a "proof required" error.
export function PaymentProofUpload({
  value,
  onChange,
  id = "payment-proof-upload",
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: {
  value: File | null;
  onChange: (file: File | null) => void;
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
}) {
  const t = useTranslations("storefront.checkoutPage");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!value || !value.type.startsWith("image/")) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(value);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={id}
        className={cn(
          "flex cursor-pointer items-center gap-3 rounded-xl border border-dashed px-4 py-3 transition",
          "border-gray-200 bg-gray-50 hover:bg-gray-100 focus-within:ring-3 focus-within:ring-ring/50",
          value && "border-[var(--store-primary)] bg-[#faf5ff]",
        )}
      >
        <input
          ref={fileInputRef}
          type="file"
          id={id}
          accept="image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf"
          className="sr-only"
          aria-label={t("paymentProofLabel")}
          aria-describedby={ariaDescribedBy}
          aria-invalid={ariaInvalid}
          onChange={(event) => onChange(event.target.files?.[0] ?? null)}
        />
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-white">
          {value ? (
            <FileText className="size-4 text-[var(--store-primary)]" />
          ) : (
            <Upload className="size-4 text-[var(--store-primary)]" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          {value ? (
            <>
              <p
                aria-live="polite"
                className="truncate text-sm font-semibold text-gray-800"
              >
                {value.name}
              </p>
              <p className="text-xs text-gray-500">
                {t("paymentProofSize", {
                  size: (value.size / 1024).toFixed(1),
                })}
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-semibold text-gray-800">
                {t("paymentProofLabel")}
              </p>
              <p className="text-xs text-gray-500">{t("paymentProofHint")}</p>
            </>
          )}
        </div>

        {!value && (
          <span className="store-theme-primary-button shrink-0 rounded-full px-3 py-1 text-xs font-semibold">
            {t("paymentProofChoose")}
          </span>
        )}
      </label>

      {value && previewUrl && (
        <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-2">
          <div className="flex items-center gap-3">
            <img
              src={previewUrl}
              alt=""
              className="size-12 rounded-lg object-cover"
            />
            <span className="text-xs text-gray-500">
              {t("paymentProofPreview")}
            </span>
          </div>
          <button
            type="button"
            aria-label={t("paymentProofRemove")}
            onClick={() => {
              onChange(null);
              if (fileInputRef.current) fileInputRef.current.value = "";
            }}
            className="flex size-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-red-50 hover:text-red-600"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      {value && !previewUrl && (
        <button
          type="button"
          onClick={() => {
            onChange(null);
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
          className="flex items-center gap-1 self-end text-xs font-medium text-gray-500 hover:text-red-600"
        >
          <X className="size-3.5" />
          {t("paymentProofRemove")}
        </button>
      )}
    </div>
  );
}
