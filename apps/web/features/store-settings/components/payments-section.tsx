"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ChevronDown, ChevronUp, CreditCard, Info } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { isPaymentMethodConfigured } from "@biasmarket/utils/payment-methods";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { UpsertPaymentMethodDtoMethod } from "@biasmarket/types";
import { usePaymentMethods } from "../queries/use-payment-methods";
import { useSavePaymentSettings } from "../mutations/use-save-payment-settings";
import { useUploadPaymentQrImage } from "../mutations/use-upload-payment-qr-image";
import {
  transferDetailsSchema,
  walletDetailsSchema,
} from "../schemas/payment-details.schema";
import { paymentInstructionsSchema } from "../schemas/payment-instructions.schema";
import { Field, SectionCard, useSavedFlash } from "./section-primitives";
import { useSettingsDraftParticipant } from "./settings-save-context";

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

export function PaymentsSection({
  storeId,
  initialPaymentInstructions,
}: {
  storeId: string;
  initialPaymentInstructions: string;
}) {
  const t = useTranslations("dashboard.settings");
  const tCommon = useTranslations("common");
  const { slug, locale } = useParams<{ slug: string; locale: string }>();
  const paymentMethodLabels = {
    YAPE: t("payments.items.yape.label"),
    PLIN: t("payments.items.plin.label"),
    TRANSFER: t("payments.items.transfer.label"),
    CASH: t("payments.items.cash.label"),
  };
  const { data: methods } = usePaymentMethods(storeId);
  const savePaymentSettings = useSavePaymentSettings(storeId, slug);
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
  const [depositPercents, setDepositPercents] = useState<
    Record<string, number>
  >({});
  const {
    register: registerPaymentInstructions,
    reset: resetPaymentInstructions,
    getValues: getPaymentInstructionValues,
    trigger: triggerPaymentInstructions,
    formState: { isDirty: instructionsDirty },
    watch: watchPaymentInstructions,
  } = useForm({
    resolver: zodResolver(paymentInstructionsSchema),
    defaultValues: { paymentInstructions: initialPaymentInstructions },
  });
  const paymentInstructions =
    watchPaymentInstructions("paymentInstructions") ?? "";

  const syncedInstructionsRef = useRef(initialPaymentInstructions);
  const methodsInitialized = useRef(false);
  const [savedDraftSignature, setSavedDraftSignature] = useState("");
  useEffect(() => {
    const previous = syncedInstructionsRef.current;
    if (initialPaymentInstructions === previous) return;
    syncedInstructionsRef.current = initialPaymentInstructions;
    resetPaymentInstructions(
      { paymentInstructions: initialPaymentInstructions },
      { keepValues: paymentInstructions !== previous },
    );
    setSavedDraftSignature((signature) => {
      try {
        return JSON.stringify({
          ...JSON.parse(signature),
          instructions: initialPaymentInstructions,
        });
      } catch {
        return signature;
      }
    });
  }, [
    initialPaymentInstructions,
    paymentInstructions,
    resetPaymentInstructions,
  ]);

  useEffect(() => {
    if (!methods || methodsInitialized.current) return;
    methodsInitialized.current = true;
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
    setSavedDraftSignature(
      JSON.stringify({
        enabled: nextEnabled,
        details: nextDetails,
        deposits: nextDeposit,
        instructions: initialPaymentInstructions,
      }),
    );
  }, [methods, initialPaymentInstructions]);

  useSavedFlash(savePaymentSettings.isSuccess, savePaymentSettings.reset);

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
  }

  const draftSignature = JSON.stringify({
    enabled: enabledByMethod,
    details: detailsForm,
    deposits: depositPercents,
    instructions: paymentInstructions,
  });
  const detailsAreValid = METHODS_WITH_DETAILS.every((method) => {
    const row = detailsForm[method];
    const savedDetails = methods?.find((item) => item.method === method)
      ?.details as Record<string, unknown> | undefined;
    const savedRow: DetailsFormRow = {
      bankName:
        typeof savedDetails?.bankName === "string" ? savedDetails.bankName : "",
      accountNumber:
        typeof savedDetails?.accountNumber === "string"
          ? savedDetails.accountNumber
          : "",
      accountHolder:
        typeof savedDetails?.accountHolder === "string"
          ? savedDetails.accountHolder
          : "",
      accountType:
        typeof savedDetails?.accountType === "string"
          ? savedDetails.accountType
          : "",
      phoneNumber:
        typeof savedDetails?.phoneNumber === "string"
          ? savedDetails.phoneNumber
          : "",
      qrImageUrl:
        typeof savedDetails?.qrImageUrl === "string"
          ? savedDetails.qrImageUrl
          : "",
    };
    if (JSON.stringify(row) === JSON.stringify(savedRow)) return true;
    const schema =
      method === "TRANSFER" ? transferDetailsSchema : walletDetailsSchema;
    return schema.safeParse({
      ...row,
      accountType: row.accountType || undefined,
      qrImageUrl: row.qrImageUrl || undefined,
    }).success;
  });
  const depositsAreValid = Object.values(depositPercents).every(
    (value) => value >= 1 && value <= 100,
  );
  const instructionsAreValid = paymentInstructionsSchema.safeParse({
    paymentInstructions,
  }).success;
  const saveDraft = useCallback(async () => {
    if (!(await triggerPaymentInstructions())) {
      throw new Error(t("saveBar.validationError"));
    }
    const parsedDetails = METHODS_WITH_DETAILS.flatMap((method) => {
      const row = detailsForm[method];
      const savedDetails = methods?.find((item) => item.method === method)
        ?.details as Record<string, unknown> | undefined;
      const savedRow: DetailsFormRow = {
        bankName:
          typeof savedDetails?.bankName === "string"
            ? savedDetails.bankName
            : "",
        accountNumber:
          typeof savedDetails?.accountNumber === "string"
            ? savedDetails.accountNumber
            : "",
        accountHolder:
          typeof savedDetails?.accountHolder === "string"
            ? savedDetails.accountHolder
            : "",
        accountType:
          typeof savedDetails?.accountType === "string"
            ? savedDetails.accountType
            : "",
        phoneNumber:
          typeof savedDetails?.phoneNumber === "string"
            ? savedDetails.phoneNumber
            : "",
        qrImageUrl:
          typeof savedDetails?.qrImageUrl === "string"
            ? savedDetails.qrImageUrl
            : "",
      };
      if (JSON.stringify(row) === JSON.stringify(savedRow)) return [];
      const schema =
        method === "TRANSFER" ? transferDetailsSchema : walletDetailsSchema;
      const parsed = schema.safeParse({
        ...row,
        accountType: row.accountType || undefined,
        qrImageUrl: row.qrImageUrl || undefined,
      });
      if (!parsed.success) throw new Error(t("payments.detailsInvalid"));
      return [{ method, details: parsed.data }];
    });
    const paymentMethods = Object.keys(
      enabledByMethod,
    ) as UpsertPaymentMethodDtoMethod[];
    const depositValues = paymentMethods.map((method) => ({
      method,
      depositPercent: depositPercents[method] ?? 100,
      savedDepositPercent:
        methods?.find((row) => row.method === method)?.depositPercent ?? 100,
    }));
    if (
      depositValues.some(
        ({ depositPercent }) => depositPercent < 1 || depositPercent > 100,
      )
    ) {
      throw new Error(t("payments.depositPercent.invalid"));
    }
    const instructions = getPaymentInstructionValues().paymentInstructions;
    const changes = new Map<
      UpsertPaymentMethodDtoMethod,
      Record<string, unknown>
    >();
    const getChange = (method: UpsertPaymentMethodDtoMethod) => {
      const change = changes.get(method) ?? { method };
      changes.set(method, change);
      return change;
    };
    for (const method of paymentMethods) {
      const savedEnabled =
        methods?.find((row) => row.method === method)?.enabled ??
        DEFAULT_ENABLED[method];
      if (enabledByMethod[method] !== savedEnabled) {
        Object.assign(getChange(method), {
          enabled: enabledByMethod[method],
          expectedEnabled: savedEnabled,
        });
      }
    }
    for (const item of parsedDetails) {
      const savedDetails = (methods?.find((row) => row.method === item.method)
        ?.details ?? {}) as Record<string, unknown>;
      Object.assign(getChange(item.method), {
        details: item.details,
        expectedDetails: savedDetails,
      });
    }
    for (const item of depositValues) {
      if (item.depositPercent !== item.savedDepositPercent) {
        Object.assign(getChange(item.method), {
          depositPercent: item.depositPercent,
          expectedDepositPercent: item.savedDepositPercent,
        });
      }
    }
    await savePaymentSettings.mutateAsync({
      methods: [...changes.values()] as Parameters<
        typeof savePaymentSettings.mutateAsync
      >[0]["methods"],
      ...(instructions !== initialPaymentInstructions && {
        paymentInstructions: instructions,
        expectedPaymentInstructions: initialPaymentInstructions,
      }),
    });
    resetPaymentInstructions(
      { paymentInstructions: instructions },
      { keepValues: true },
    );
    setSavedDraftSignature(draftSignature);
  }, [
    detailsForm,
    depositPercents,
    draftSignature,
    enabledByMethod,
    getPaymentInstructionValues,
    methods,
    resetPaymentInstructions,
    initialPaymentInstructions,
    savePaymentSettings,
    t,
    triggerPaymentInstructions,
  ]);
  const discardDraft = useCallback(() => {
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
      if (!METHODS_WITH_DETAILS.includes(row.method as MethodWithDetails))
        continue;
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
    resetPaymentInstructions({
      paymentInstructions: initialPaymentInstructions,
    });
    setSavedDraftSignature(
      JSON.stringify({
        enabled: nextEnabled,
        details: nextDetails,
        deposits: nextDeposit,
        instructions: initialPaymentInstructions,
      }),
    );
  }, [initialPaymentInstructions, methods, resetPaymentInstructions]);
  useSettingsDraftParticipant({
    id: "payments",
    tab: "payments",
    dirty:
      Boolean(methods) &&
      (draftSignature !== savedDraftSignature || instructionsDirty),
    valid: detailsAreValid && depositsAreValid && instructionsAreValid,
    validationError: t("saveBar.validationError"),
    save: saveDraft,
    discard: discardDraft,
  });

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
                    aria-label={
                      paymentMethodLabels[method.method] ?? method.method
                    }
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
                      <Field
                        id="settings-payment-transfer-bank"
                        label={t("payments.fields.bankName")}
                      >
                        <Input
                          id="settings-payment-transfer-bank"
                          aria-label={t("payments.fields.bankName")}
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
                      </Field>
                      <Field
                        id="settings-payment-transfer-account"
                        label={t("payments.fields.accountNumber")}
                      >
                        <Input
                          id="settings-payment-transfer-account"
                          aria-label={t("payments.fields.accountNumber")}
                          placeholder={t("payments.fields.accountNumber")}
                          value={detailsForm.TRANSFER.accountNumber}
                          onChange={(e) =>
                            updateDetailField(
                              "TRANSFER",
                              "accountNumber",
                              e.target.value,
                            )
                          }
                          inputMode="numeric"
                        />
                      </Field>
                      <Field
                        id="settings-payment-transfer-holder"
                        label={t("payments.fields.accountHolder")}
                      >
                        <Input
                          id="settings-payment-transfer-holder"
                          aria-label={t("payments.fields.accountHolder")}
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
                      </Field>
                      <Field
                        id="settings-payment-transfer-type"
                        label={t("payments.fields.accountType")}
                      >
                        <Input
                          id="settings-payment-transfer-type"
                          aria-label={t("payments.fields.accountType")}
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
                      </Field>
                    </>
                  ) : (
                    <>
                      <Field
                        id={`settings-payment-${method.method.toLowerCase()}-phone`}
                        label={t("payments.fields.phoneNumber")}
                      >
                        <Input
                          id={`settings-payment-${method.method.toLowerCase()}-phone`}
                          aria-label={t("payments.fields.phoneNumber")}
                          type="tel"
                          autoComplete="tel"
                          inputMode="tel"
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
                      </Field>
                      <Field
                        id={`settings-payment-${method.method.toLowerCase()}-holder`}
                        label={t("payments.fields.accountHolder")}
                      >
                        <Input
                          id={`settings-payment-${method.method.toLowerCase()}-holder`}
                          aria-label={t("payments.fields.accountHolder")}
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
                      </Field>
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
                            aria-label={t("payments.uploadQr")}
                            className="sr-only"
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
                  <Field
                    id={`settings-payment-${method.method.toLowerCase()}-deposit`}
                    label={t("payments.depositPercent.label")}
                  >
                    <Input
                      id={`settings-payment-${method.method.toLowerCase()}-deposit`}
                      aria-label={t("payments.depositPercent.label")}
                      type="number"
                      min={1}
                      max={100}
                      placeholder="100"
                      value={depositPercents[method.method] ?? 100}
                      onChange={(e) =>
                        updateDepositPercent(method.method, e.target.value)
                      }
                    />
                  </Field>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-5 rounded-2xl border border-[#f0e7f8] bg-white p-4">
        <Field
          id="settings-payment-instructions"
          label={t("profile.instructionsLabel")}
        >
          <Textarea
            id="settings-payment-instructions"
            {...registerPaymentInstructions("paymentInstructions")}
            placeholder={t("profile.instructionsPlaceholder")}
            rows={4}
            className="store-theme-input rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] text-[#341b55] shadow-none"
          />
          <p className="mt-1 text-xs text-[#9582ad]">
            {t("payments.instructionsHelp")}{" "}
            <Link
              href={`/${locale}/dashboard/${slug}/payments`}
              className="font-semibold text-[#6b36a1] underline underline-offset-2"
            >
              {t("payments.reviewPaymentsLink")}
            </Link>
          </p>
        </Field>
      </div>

      {savePaymentSettings.isError ? (
        <p className="mt-4 text-sm text-[#b24368]">
          {savePaymentSettings.error instanceof Error
            ? savePaymentSettings.error.message
            : tCommon("networkError")}
        </p>
      ) : null}

      <Separator className="my-5 bg-[#f0e7f8]" />

      <p className="text-sm text-[#8f7da8]">{t("payments.footer")}</p>
    </SectionCard>
  );
}
