"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { AlertTriangle, Banknote, Check, Copy } from "lucide-react";
import type { PaymentMethodConfigResponseDto } from "@biasmarket/types";

interface PaymentMethodDetailsProps {
  method: PaymentMethodConfigResponseDto;
}

export function PaymentMethodDetails({ method }: PaymentMethodDetailsProps) {
  const t = useTranslations("storefront.checkoutPage");
  const details = method.details ?? {};

  if (method.method === "CASH") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        <Banknote className="store-theme-active-text size-5 shrink-0" />
        <p>{t("cashPaymentNote")}</p>
      </div>
    );
  }

  const hasTransferDetails =
    method.method === "TRANSFER" &&
    typeof details.bankName === "string" &&
    details.bankName;

  const hasWalletDetails =
    (method.method === "YAPE" || method.method === "PLIN") &&
    typeof details.phoneNumber === "string" &&
    details.phoneNumber;

  if (!hasTransferDetails && !hasWalletDetails) {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
        <AlertTriangle className="size-5 shrink-0" />
        <p>{t("paymentDetailsNotConfigured")}</p>
      </div>
    );
  }

  if (hasTransferDetails) {
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-gray-100 bg-gray-50 p-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
          {t("paymentDetailsTitle")}
        </span>
        <dl className="flex flex-col gap-1 text-sm text-gray-600">
          <DetailRow
            label={t("confirmationBankName")}
            value={String(details.bankName)}
          />
          <DetailRow
            label={t("confirmationAccountNumber")}
            value={String(details.accountNumber)}
            copyable
          />
          <DetailRow
            label={t("confirmationAccountHolder")}
            value={String(details.accountHolder)}
          />
          {typeof details.accountType === "string" && details.accountType && (
            <DetailRow
              label={t("confirmationAccountType")}
              value={String(details.accountType)}
            />
          )}
        </dl>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-gray-100 bg-gray-50 p-4">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
        {t("paymentDetailsTitle")}
      </span>
      <dl className="flex flex-col gap-1 text-sm text-gray-600">
        <DetailRow
          label={t("confirmationPhoneNumber")}
          value={String(details.phoneNumber)}
          copyable
        />
        <DetailRow
          label={t("confirmationAccountHolder")}
          value={String(details.accountHolder)}
        />
      </dl>
      {typeof details.qrImageUrl === "string" && details.qrImageUrl && (
        <Image
          src={details.qrImageUrl}
          alt={t("confirmationQrAlt")}
          width={160}
          height={160}
          className="mt-1 size-40 rounded-lg border border-gray-100 object-contain"
        />
      )}
    </div>
  );
}

function DetailRow({
  label,
  value,
  copyable = false,
}: {
  label: string;
  value: string;
  copyable?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex items-center justify-between gap-2">
      <dt>{label}</dt>
      <dd className="flex items-center gap-1.5 font-medium text-gray-900">
        {value}
        {copyable && (
          <button
            type="button"
            onClick={handleCopy}
            className="rounded p-0.5 text-gray-400 transition hover:text-gray-600"
            aria-label={`Copiar ${label}`}
          >
            {copied ? (
              <Check className="size-3.5 text-green-500" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </button>
        )}
      </dd>
    </div>
  );
}
