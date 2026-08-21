"use client";

import { useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { AlertTriangle, Banknote, Check, Copy } from "lucide-react";
import type { PaymentMethodConfigResponseDto } from "@biasmarket/types";
import { isPaymentMethodConfigured } from "@biasmarket/utils/payment-methods";

interface PaymentMethodDetailsProps {
  method: PaymentMethodConfigResponseDto;
}

function getDetail(details: Record<string, unknown>, key: string): string {
  const val = details[key];
  return typeof val === "string" && val ? val : "";
}

export function PaymentMethodDetails({ method }: PaymentMethodDetailsProps) {
  const t = useTranslations("storefront.checkoutPage");
  const details = (method.details ?? {}) as Record<string, unknown>;

  if (method.method === "CASH") {
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
        <Banknote className="store-theme-active-text size-5 shrink-0" />
        <p>{t("cashPaymentNote")}</p>
      </div>
    );
  }

  if (method.method === "TRANSFER") {
    const bankName = getDetail(details, "bankName");
    if (!isPaymentMethodConfigured("TRANSFER", details)) {
      return <NotConfiguredBanner />;
    }
    return (
      <div className="flex flex-col gap-2 rounded-2xl border border-gray-100 bg-gray-50 p-4">
        <SectionTitle>{t("paymentDetailsTitle")}</SectionTitle>
        <dl className="flex flex-col gap-1 text-sm text-gray-600">
          <DetailRow label={t("confirmationBankName")} value={bankName} />
          <DetailRow
            label={t("confirmationAccountNumber")}
            value={getDetail(details, "accountNumber")}
            copyable
          />
          <DetailRow
            label={t("confirmationAccountHolder")}
            value={getDetail(details, "accountHolder")}
          />
          <OptionalDetailRow
            label={t("confirmationAccountType")}
            details={details}
            field="accountType"
          />
        </dl>
      </div>
    );
  }

  // YAPE | PLIN — show if phone OR qr is configured
  const phoneNumber = getDetail(details, "phoneNumber");
  const accountHolder = getDetail(details, "accountHolder");
  const qrImageUrl = getDetail(details, "qrImageUrl");

  if (!isPaymentMethodConfigured(method.method, details)) {
    return <NotConfiguredBanner />;
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-gray-100 bg-gray-50 p-4">
      <SectionTitle>{t("paymentDetailsTitle")}</SectionTitle>
      <dl className="flex flex-col gap-1 text-sm text-gray-600">
        {phoneNumber && (
          <DetailRow
            label={t("confirmationPhoneNumber")}
            value={phoneNumber}
            copyable
          />
        )}
        {accountHolder && (
          <DetailRow
            label={t("confirmationAccountHolder")}
            value={accountHolder}
          />
        )}
      </dl>
      {qrImageUrl && (
        <Image
          src={qrImageUrl}
          alt={t("confirmationQrAlt")}
          width={160}
          height={160}
          className="mt-1 size-40 rounded-lg border border-gray-100 object-contain"
        />
      )}
    </div>
  );
}

function NotConfiguredBanner() {
  const t = useTranslations("storefront.checkoutPage");
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-700">
      <AlertTriangle className="size-5 shrink-0" />
      <p>{t("paymentDetailsNotConfigured")}</p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
      {children}
    </span>
  );
}

function OptionalDetailRow({
  label,
  details,
  field,
}: {
  label: string;
  details: Record<string, unknown>;
  field: string;
}) {
  const value = getDetail(details, field);
  if (!value) return null;
  return <DetailRow label={label} value={value} />;
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
  const t = useTranslations("storefront.checkoutPage");
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
            aria-label={t("copyPaymentDetail", { field: label })}
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
