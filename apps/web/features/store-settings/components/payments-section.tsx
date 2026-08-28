"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronDown, ChevronUp, CreditCard, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { isPaymentMethodConfigured } from "@biasmarket/utils/payment-methods";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { UpsertPaymentMethodDtoMethod } from "@biasmarket/types";
import { usePaymentMethods } from "../queries/use-payment-methods";
import { useSavePaymentMethods } from "../mutations/use-save-payment-methods";
import { useSavePaymentMethodDetails } from "../mutations/use-save-payment-method-details";
import { useSaveDepositPercent } from "../mutations/use-save-deposit-percent";
import { useUploadPaymentQrImage } from "../mutations/use-upload-payment-qr-image";
import {
  transferDetailsSchema,
  walletDetailsSchema,
} from "../schemas/payment-details.schema";
import { SectionCard, useSavedFlash } from "./section-primitives";

const PAYMENT_METHODS = [
  {
    key: "yape",
    method: "YAPE",
    color: "bg-[#f8ddf2] text-[#bd2d84]",
    logo: "/logos/integrations/yape.webp",
  },
  {
    key: "plin",
    method: "PLIN",
    color: "bg-[#ece0ff] text-[#7540d9]",
    logo: "/logos/integrations/plin.png",
  },
  { key: "transfer", method: "TRANSFER", color: "bg-[#e4f5ff] text-[#2472ae]" },
  { key: "cash", method: "CASH", color: "bg-[#ebf9ef] text-[#27965e]" },
] as const;

const TRANSFER_BANKS = [
  {
    src: "/logos/integrations/bcp.png",
    alt: "BCP",
    width: 761,
    height: 262,
    containerClassName: "max-w-16",
  },
  {
    src: "/logos/integrations/interbank-horizontal-logo.webp",
    alt: "Interbank",
    width: 3840,
    height: 730,
    containerClassName: "max-w-24",
  },
] as const;

const DEFAULT_ENABLED: Record<string, boolean> = {
  YAPE: true,
  PLIN: true,
  TRANSFER: true,
  CASH: true,
};

const METHODS_WITH_DETAILS = ["TRANSFER", "YAPE", "PLIN"] as const;
type MethodWithDetails = (typeof METHODS_WITH_DETAILS)[number];

type DetailsFormRow = {
  bankName: string;
  accountNumber: string;
  accountHolder: string;
  accountType: string;
  phoneNumber: string;
  qrImageUrl: string;
};

const EMPTY_DETAILS_ROW: DetailsFormRow = {
  bankName: "",
  accountNumber: "",
  accountHolder: "",
  accountType: "",
  phoneNumber: "",
  qrImageUrl: "",
};

export function PaymentsSection({ storeId }: { storeId: string }) {
  const t = useTranslations("dashboard.settings");
  const tCommon = useTranslations("common");
  const { data: methods } = usePaymentMethods(storeId);
  const saveMethods = useSavePaymentMethods(storeId);
  const saveDetails = useSavePaymentMethodDetails(storeId);
  const saveDeposit = useSaveDepositPercent(storeId);
  const uploadQr = useUploadPaymentQrImage(storeId, tCommon("networkError"));

  const [enabledByMethod, setEnabledByMethod] =
    useState<Record<string, boolean>>(DEFAULT_ENABLED);
  const [detailsForm, setDetailsForm] = useState<
    Record<MethodWithDetails, DetailsFormRow>
  >({
    TRANSFER: EMPTY_DETAILS_ROW,
    YAPE: EMPTY_DETAILS_ROW,
    PLIN: EMPTY_DETAILS_ROW,
  });
  const [expandedMethod, setExpandedMethod] =
    useState<MethodWithDetails | null>(null);
  const [detailsError, setDetailsError] = useState<
    Partial<Record<MethodWithDetails, string>>
  >({});
  const [savedDetailsMethod, setSavedDetailsMethod] =
    useState<MethodWithDetails | null>(null);
  const [depositPercents, setDepositPercents] = useState<
    Record<string, number>
  >({});
  const [depositError, setDepositError] = useState<
    Record<string, string | null>
  >({});

  useEffect(() => {
    if (!methods) return;
    const nextEnabled = { ...DEFAULT_ENABLED };
    const nextDetails = {
      TRANSFER: EMPTY_DETAILS_ROW,
      YAPE: EMPTY_DETAILS_ROW,
      PLIN: EMPTY_DETAILS_ROW,
    };
    const nextDeposit: Record<string, number> = {};
    for (const row of methods) {
      nextEnabled[row.method] = row.enabled;
      nextDeposit[row.method] =
        typeof row.depositPercent === "number" ? row.depositPercent : 100;
      if (!METHODS_WITH_DETAILS.includes(row.method as MethodWithDetails)) {
        continue;
      }
      const details = row.details as Record<string, unknown>;
      nextDetails[row.method as MethodWithDetails] = {
        bankName: typeof details.bankName === "string" ? details.bankName : "",
        accountNumber:
          typeof details.accountNumber === "string"
            ? details.accountNumber
            : "",
        accountHolder:
          typeof details.accountHolder === "string"
            ? details.accountHolder
            : "",
        accountType:
          typeof details.accountType === "string" ? details.accountType : "",
        phoneNumber:
          typeof details.phoneNumber === "string" ? details.phoneNumber : "",
        qrImageUrl:
          typeof details.qrImageUrl === "string" ? details.qrImageUrl : "",
      };
    }
    setEnabledByMethod(nextEnabled);
    setDetailsForm(nextDetails);
    setDepositPercents(nextDeposit);
  }, [methods]);

  useSavedFlash(saveMethods.isSuccess, saveMethods.reset);

  function updateDetailField(
    method: MethodWithDetails,
    field: keyof DetailsFormRow,
    value: string,
  ) {
    setDetailsForm((prev) => ({
      ...prev,
      [method]: { ...prev[method], [field]: value },
    }));
  }

  function handleSaveDetails(method: MethodWithDetails) {
    const row = detailsForm[method];
    const schema =
      method === "TRANSFER" ? transferDetailsSchema : walletDetailsSchema;
    const parsed = schema.safeParse({
      ...row,
      accountType: row.accountType || undefined,
      qrImageUrl: row.qrImageUrl || undefined,
    });
    if (!parsed.success) {
      setDetailsError((prev) => ({
        ...prev,
        [method]: t("payments.detailsInvalid"),
      }));
      return;
    }
    setDetailsError((prev) => ({ ...prev, [method]: undefined }));
    saveDetails.mutate(
      { method, details: parsed.data },
      {
        onSuccess: () => {
          setSavedDetailsMethod(method);
          globalThis.setTimeout(
            () =>
              setSavedDetailsMethod((current) =>
                current === method ? null : current,
              ),
            1800,
          );
        },
        onError: (error) => {
          setSavedDetailsMethod(null);
          setDetailsError((prev) => ({
            ...prev,
            [method]:
              error instanceof Error
                ? error.message
                : t("payments.detailsInvalid"),
          }));
        },
      },
    );
  }

  function handleQrFileChange(method: "YAPE" | "PLIN", file: File | undefined) {
    if (!file) return;
    uploadQr.mutate({ method, file });
  }

  // CASH is seeded enabled on every store and always counts as "configured"
  // (it needs no details) — excluded here so the nudge targets sellers who
  // haven't set up a real trackable method yet, not every store by default.
  const anyConfigured = methods?.some(
    (m) =>
      m.method !== "CASH" &&
      m.enabled &&
      isPaymentMethodConfigured(m.method, m.details),
  );
  function updateDepositPercent(method: string, value: string) {
    const num = parseInt(value, 10);
    setDepositPercents((prev) => ({
      ...prev,
      [method]: isNaN(num) ? 0 : num,
    }));
    setDepositError((prev) => ({ ...prev, [method]: null }));
  }

  function handleSaveDepositPercent(method: UpsertPaymentMethodDtoMethod) {
    const pct = depositPercents[method];
    if (pct === undefined || pct < 1 || pct > 100) {
      setDepositError((prev) => ({
        ...prev,
        [method]: t("payments.depositPercent.invalid"),
      }));
      return;
    }
    saveDeposit.mutate(
      { method, depositPercent: pct },
      {
        onSuccess: () => {
          setDepositError((prev) => ({ ...prev, [method]: null }));
        },
        onError: (error) => {
          setDepositError((prev) => ({
            ...prev,
            [method]:
              error instanceof Error
                ? error.message
                : t("payments.depositPercent.invalid"),
          }));
        },
      },
    );
  }

  return (
    <SectionCard
      icon={CreditCard}
      title={t("payments.title")}
      description={t("payments.description")}
    >
      {methods && !anyConfigured && (
        <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[#e4e0fb] bg-[#f7f5ff] p-4 text-sm text-[#5b4b8a]">
          <Info className="mt-0.5 size-5 shrink-0 text-[#7540d9]" />
          <div>
            <p className="font-medium text-[#341b55]">
              {t("payments.setupNudgeTitle")}
            </p>
            <p className="mt-1 text-xs text-[#8f7da8]">
              {t("payments.setupNudgeDescription")}
            </p>
          </div>
        </div>
      )}
      <div className="space-y-3">
        {PAYMENT_METHODS.map((method) => {
          const hasDetails = METHODS_WITH_DETAILS.includes(
            method.method as MethodWithDetails,
          );
          const isExpanded = expandedMethod === method.method;

          return (
            <div
              key={method.key}
              className="rounded-2xl border border-[#f0e7f8] bg-[#fcf9ff]"
            >
              <div className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  {"logo" in method ? (
                    <Image
                      src={method.logo}
                      alt={t(`payments.items.${method.key}.label`)}
                      width={32}
                      height={32}
                      className="size-8 shrink-0 object-contain"
                    />
                  ) : (
                    <Badge
                      className={cn(
                        "rounded-2xl px-2.5 py-1.5 text-xs font-semibold",
                        method.color,
                      )}
                    >
                      {t(`payments.items.${method.key}.short`)}
                    </Badge>
                  )}
                  <div>
                    <p className="text-sm font-medium text-[#341b55]">
                      {t(`payments.items.${method.key}.label`)}
                    </p>
                    <p className="text-xs text-[#9582ad]">
                      {t(`payments.items.${method.key}.description`)}
                    </p>
                    {method.method === "TRANSFER" && (
                      <div className="mt-2 flex items-center gap-3">
                        {TRANSFER_BANKS.map((bank) => (
                          <div
                            key={bank.src}
                            className={bank.containerClassName}
                          >
                            <Image
                              src={bank.src}
                              alt={bank.alt}
                              width={bank.width}
                              height={bank.height}
                              className="h-auto w-full object-contain"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {hasDetails && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() =>
                        setExpandedMethod(
                          isExpanded
                            ? null
                            : (method.method as MethodWithDetails),
                        )
                      }
                      className="h-8 px-2 text-xs text-[#8f7da8]"
                    >
                      {isExpanded
                        ? t("payments.hideDetails")
                        : t("payments.editDetails")}
                      {isExpanded ? (
                        <ChevronUp className="ml-1 size-3.5" />
                      ) : (
                        <ChevronDown className="ml-1 size-3.5" />
                      )}
                    </Button>
                  )}
                  <Switch
                    checked={enabledByMethod[method.method] ?? true}
                    onCheckedChange={(checked) =>
                      setEnabledByMethod((prev) => ({
                        ...prev,
                        [method.method]: checked,
                      }))
                    }
                  />
                </div>
              </div>

              {hasDetails && isExpanded && (
                <div className="space-y-3 border-t border-[#f0e7f8] px-4 py-4">
                  {method.method === "TRANSFER" ? (
                    <>
                      <Input
                        placeholder={t("payments.fields.bankName")}
                        value={detailsForm.TRANSFER.bankName}
                        onChange={(e) =>
                          updateDetailField(
                            "TRANSFER",
                            "bankName",
                            e.target.value,
                          )
                        }
                      />
                      <Input
                        placeholder={t("payments.fields.accountNumber")}
                        value={detailsForm.TRANSFER.accountNumber}
                        onChange={(e) =>
                          updateDetailField(
                            "TRANSFER",
                            "accountNumber",
                            e.target.value,
                          )
                        }
                      />
                      <Input
                        placeholder={t("payments.fields.accountHolder")}
                        value={detailsForm.TRANSFER.accountHolder}
                        onChange={(e) =>
                          updateDetailField(
                            "TRANSFER",
                            "accountHolder",
                            e.target.value,
                          )
                        }
                      />
                      <Input
                        placeholder={t("payments.fields.accountType")}
                        value={detailsForm.TRANSFER.accountType}
                        onChange={(e) =>
                          updateDetailField(
                            "TRANSFER",
                            "accountType",
                            e.target.value,
                          )
                        }
                      />
                    </>
                  ) : (
                    <>
                      <Input
                        placeholder={t("payments.fields.phoneNumber")}
                        value={detailsForm[method.method].phoneNumber}
                        onChange={(e) =>
                          updateDetailField(
                            method.method as "YAPE" | "PLIN",
                            "phoneNumber",
                            e.target.value,
                          )
                        }
                      />
                      <Input
                        placeholder={t("payments.fields.accountHolder")}
                        value={detailsForm[method.method].accountHolder}
                        onChange={(e) =>
                          updateDetailField(
                            method.method as "YAPE" | "PLIN",
                            "accountHolder",
                            e.target.value,
                          )
                        }
                      />
                      <div className="flex items-center gap-3">
                        {detailsForm[method.method].qrImageUrl && (
                          <Image
                            src={detailsForm[method.method].qrImageUrl}
                            alt="QR"
                            width={64}
                            height={64}
                            className="size-16 rounded-lg border border-[#f0e7f8] object-contain"
                          />
                        )}
                        <label className="cursor-pointer text-xs font-medium text-[#7540d9]">
                          {t("payments.uploadQr")}
                          <input
                            type="file"
                            accept="image/png,image/jpeg"
                            className="hidden"
                            onChange={(e) =>
                              handleQrFileChange(
                                method.method as "YAPE" | "PLIN",
                                e.target.files?.[0],
                              )
                            }
                          />
                        </label>
                        {uploadQr.isPending && (
                          <span className="text-xs text-[#9582ad]">
                            {t("payments.uploading")}
                          </span>
                        )}
                      </div>
                    </>
                  )}

                  {detailsError[method.method as MethodWithDetails] && (
                    <p className="text-xs text-[#b24368]">
                      {detailsError[method.method as MethodWithDetails]}
                    </p>
                  )}

                  <Button
                    type="button"
                    size="sm"
                    onClick={() =>
                      handleSaveDetails(method.method as MethodWithDetails)
                    }
                    disabled={saveDetails.isPending}
                    className="store-theme-primary-button h-9 rounded-xl px-4 text-xs font-semibold hover:opacity-100"
                  >
                    {savedDetailsMethod === method.method
                      ? t("saved")
                      : saveDetails.isPending
                        ? t("saving")
                        : t("payments.saveDetails")}
                  </Button>

                  <Separator className="my-3 bg-[#f0e7f8]" />

                  <p className="text-xs font-medium text-[#341b55]">
                    {t("payments.depositPercent.label")}
                  </p>
                  <p className="text-xs text-[#9582ad]">
                    {t("payments.depositPercent.help")}
                  </p>
                  <p className="text-xs text-[#9582ad]">
                    {t("payments.depositPercent.checkoutHint")}
                  </p>
                  <Input
                    type="number"
                    min={1}
                    max={100}
                    placeholder="100"
                    value={depositPercents[method.method] ?? 100}
                    onChange={(e) =>
                      updateDepositPercent(method.method, e.target.value)
                    }
                  />

                  {depositError[method.method] && (
                    <p className="text-xs text-[#b24368]">
                      {depositError[method.method]}
                    </p>
                  )}

                  <Button
                    type="button"
                    size="sm"
                    onClick={() => handleSaveDepositPercent(method.method)}
                    disabled={saveDeposit.isPending}
                    className="store-theme-primary-button h-9 rounded-xl px-4 text-xs font-semibold hover:opacity-100"
                  >
                    {saveDeposit.isSuccess
                      ? t("saved")
                      : saveDeposit.isPending
                        ? t("saving")
                        : t("save")}
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {saveMethods.isError ? (
        <p className="mt-4 text-sm text-[#b24368]">
          {saveMethods.error instanceof Error
            ? saveMethods.error.message
            : String(saveMethods.error)}
        </p>
      ) : null}

      <Separator className="my-5 bg-[#f0e7f8]" />

      <div className="flex items-center justify-between gap-4">
        <p className="text-sm text-[#8f7da8]">{t("payments.footer")}</p>
        <Button
          onClick={() => saveMethods.mutate(enabledByMethod)}
          disabled={saveMethods.isPending}
          className="store-theme-primary-button h-11 rounded-2xl px-5 text-sm font-semibold hover:opacity-100"
        >
          {saveMethods.isSuccess
            ? t("saved")
            : saveMethods.isPending
              ? t("saving")
              : t("save")}
        </Button>
      </div>
    </SectionCard>
  );
}
