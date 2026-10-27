"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { formatPhone, validatePhone } from "@biasmarket/utils/phone-country";
import type {
  AssistedOrderLinkResponseDto,
  OrderResponseDto,
} from "@biasmarket/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PhoneInput } from "@/components/ui/phone-input";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FormField } from "@/components/shared/form-a11y";
import { useAssistedLinkTemplate } from "../queries/use-assisted-link-template";
import { useRegenerateAccessLink } from "../mutations/use-regenerate-access-link";
import { useCorrectBuyerPhone } from "../mutations/use-correct-buyer-phone";
import { buildAssistedLinkMessage } from "../lib/assisted-link-message";
import { LinkMessagePanel } from "./link-message-panel";

type LinkResult = AssistedOrderLinkResponseDto;

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

// Seller actions on an assisted order, shown inside the order detail. The
// link is never recoverable (only its hash is stored), so "send or copy"
// always creates a new one; the result lives in component state only.
export function AssistedOrderSection({
  order,
  storeId,
  storeName,
}: {
  order: OrderResponseDto;
  storeId: string;
  storeName: string;
}) {
  const t = useTranslations("dashboard.assistedOrder.detail");
  const tErrors = useTranslations("dashboard.assistedOrder.errors");
  const { locale, slug } = useParams<{ locale?: string; slug?: string }>();
  const template = useAssistedLinkTemplate(storeId);
  const regenerate = useRegenerateAccessLink(storeId);
  const correct = useCorrectBuyerPhone(storeId);

  const [result, setResult] = useState<LinkResult | null>(null);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [fixOpen, setFixOpen] = useState(false);
  const [phone, setPhone] = useState("+51");
  const [phoneError, setPhoneError] = useState<string | undefined>();

  const closed =
    order.status === "CANCELLED" || order.paymentStatus === "CANCELLED";
  const correctBlockedReason = closed
    ? t("correctDisabledClosed")
    : order.claimedAt
      ? t("correctDisabledClaimed")
      : order.linkFirstOpenedAt
        ? t("correctDisabledOpened")
        : null;

  const message = useMemo(
    () =>
      result
        ? buildAssistedLinkMessage({
            order: result.order,
            storeName,
            accessUrl: result.accessUrl,
            template: template.data,
          })
        : "",
    [result, storeName, template.data],
  );

  const runRegenerate = async () => {
    setConfirmRegenerate(false);
    try {
      setResult(await regenerate.mutateAsync(order.id));
    } catch {
      // Shown from the mutation's error state.
    }
  };

  const openFix = () => {
    setPhone("+51");
    setPhoneError(undefined);
    correct.reset();
    setFixOpen(true);
  };

  const submitFix = async () => {
    const validated = validatePhone(phone);
    if (!phone.replace(/\D/g, "").length || phone.trim() === "+51") {
      setPhoneError(tErrors("phoneRequired"));
      return;
    }
    if (!validated.ok) {
      setPhoneError(tErrors("phoneInvalid"));
      return;
    }
    setPhoneError(undefined);
    try {
      setResult(
        await correct.mutateAsync({
          orderId: order.id,
          customerPhone: validated.phone,
        }),
      );
      setFixOpen(false);
    } catch {
      // Shown from the mutation's error state inside the dialog.
    }
  };

  const actionError = regenerate.error
    ? errorMessage(regenerate.error, tErrors("generic"))
    : null;

  return (
    <div className="space-y-4 rounded-[24px] border border-[#eadcf8] bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="secondary">{t("badge")}</Badge>
        {order.createdByName ? (
          <span className="text-xs text-[#8f7da8]">
            {t("createdBy", { name: order.createdByName })}
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-baseline justify-between gap-2 text-sm">
        <span className="font-medium text-[#8f7da8]">{t("buyerNumber")}</span>
        <span className="font-semibold text-[#2d1649]">
          {formatPhone(order.customerPhone)}
        </span>
      </div>
      {slug && locale ? (
        order.customerId ? (
          <Link
            href={`/${locale}/dashboard/${slug}/customers?customer=${encodeURIComponent(order.customerId)}`}
            className="inline-flex min-h-11 items-center text-sm font-medium text-[#5a3d82] underline"
          >
            {t("customers")}
          </Link>
        ) : null
      ) : null}

      <div className="space-y-3 border-t border-[#f3ebff] pt-4">
        <h3 className="font-semibold text-[#2d1649]">{t("linkTitle")}</h3>

        {closed ? (
          <p role="status" className="text-sm text-[#b24368]">
            {t("closed")}
          </p>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                type="button"
                onClick={runRegenerate}
                disabled={regenerate.isPending}
                aria-describedby="assisted-send-warning"
                className="store-theme-primary-button min-h-11 rounded-2xl px-5 text-sm font-semibold hover:opacity-100"
              >
                {regenerate.isPending ? t("working") : t("sendLink")}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmRegenerate(true)}
                disabled={regenerate.isPending}
                className="min-h-11 rounded-2xl px-5 text-sm font-semibold"
              >
                {t("regenerate")}
              </Button>
            </div>
            <p id="assisted-send-warning" className="text-xs text-[#8f7da8]">
              {t("sendLinkWarning")}
            </p>
          </>
        )}

        {actionError ? (
          <p role="alert" className="text-sm text-error-foreground">
            {actionError}
          </p>
        ) : null}

        <div className="flex flex-col gap-1">
          <Button
            type="button"
            variant="outline"
            onClick={openFix}
            disabled={correctBlockedReason !== null}
            aria-describedby={
              correctBlockedReason ? "assisted-correct-reason" : undefined
            }
            className="min-h-11 self-start rounded-2xl px-5 text-sm font-semibold"
          >
            {t("correctNumber")}
          </Button>
          {correctBlockedReason ? (
            <p id="assisted-correct-reason" className="text-xs text-[#8f7da8]">
              {correctBlockedReason}
            </p>
          ) : null}
        </div>
      </div>

      {result ? (
        <div className="space-y-4 border-t border-[#f3ebff] pt-4">
          <p role="status" className="text-sm font-semibold text-[#159a63]">
            {t("linkReady")}
          </p>
          <LinkMessagePanel
            message={message}
            phone={result.order.customerPhone}
            ready={template.isSuccess || template.isError}
            onFixNumber={openFix}
            fixNumberDisabled={correctBlockedReason !== null}
            fixNumberDisabledReason={correctBlockedReason ?? undefined}
          />
        </div>
      ) : null}

      <AlertDialog open={confirmRegenerate} onOpenChange={setConfirmRegenerate}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("regenerateTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("regenerateBody")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfirmRegenerate(false)}
              className="min-h-11 rounded-xl"
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              onClick={runRegenerate}
              className="store-theme-primary-button min-h-11 rounded-xl"
            >
              {t("regenerateConfirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={fixOpen} onOpenChange={setFixOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("correctTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("correctBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <FormField
            id="assisted-fix-phone"
            label={t("buyerNumber")}
            error={phoneError}
          >
            {(props) => (
              <PhoneInput
                {...props}
                value={phone}
                onChange={setPhone}
                selectClassName="min-h-11 text-base"
                inputClassName="min-h-11 text-base"
              />
            )}
          </FormField>
          {correct.error ? (
            <p role="alert" className="text-sm text-error-foreground">
              {errorMessage(correct.error, tErrors("generic"))}
            </p>
          ) : null}
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFixOpen(false)}
              className="min-h-11 rounded-xl"
            >
              {t("cancel")}
            </Button>
            <Button
              type="button"
              onClick={submitFix}
              disabled={correct.isPending}
              className="store-theme-primary-button min-h-11 rounded-xl"
            >
              {correct.isPending ? t("working") : t("correctSubmit")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
