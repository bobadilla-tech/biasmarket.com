"use client";

import { useEffect, useState } from "react";
import { CreditCard } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { usePaymentMethods } from "../queries/use-payment-methods";
import { useSavePaymentMethods } from "../mutations/use-save-payment-methods";
import { SectionCard, useSavedFlash } from "./section-primitives";

const PAYMENT_METHODS = [
  { key: "yape", method: "YAPE", color: "bg-[#f8ddf2] text-[#bd2d84]" },
  { key: "plin", method: "PLIN", color: "bg-[#ece0ff] text-[#7540d9]" },
  { key: "transfer", method: "TRANSFER", color: "bg-[#e4f5ff] text-[#2472ae]" },
  { key: "cash", method: "CASH", color: "bg-[#ebf9ef] text-[#27965e]" },
] as const;

const DEFAULT_ENABLED: Record<string, boolean> = {
  YAPE: true,
  PLIN: true,
  TRANSFER: true,
  CASH: true,
};

export function PaymentsSection({ storeId }: { storeId: string }) {
  const t = useTranslations("dashboard.settings");
  const { data: methods } = usePaymentMethods(storeId);
  const saveMethods = useSavePaymentMethods(storeId);

  const [enabledByMethod, setEnabledByMethod] = useState<
    Record<string, boolean>
  >(DEFAULT_ENABLED);

  useEffect(() => {
    if (!methods) return;
    const next = { ...DEFAULT_ENABLED };
    for (const row of methods) next[row.method] = row.enabled;
    setEnabledByMethod(next);
  }, [methods]);

  useSavedFlash(saveMethods.isSuccess, saveMethods.reset);

  return (
    <SectionCard
      icon={CreditCard}
      title={t("payments.title")}
      description={t("payments.description")}
    >
      <div className="space-y-3">
        {PAYMENT_METHODS.map((method) => (
          <div
            key={method.key}
            className="flex items-center justify-between rounded-2xl border border-[#f0e7f8] bg-[#fcf9ff] px-4 py-3"
          >
            <div className="flex items-center gap-3">
              <Badge
                className={cn(
                  "rounded-2xl px-2.5 py-1.5 text-xs font-semibold",
                  method.color,
                )}
              >
                {t(`payments.items.${method.key}.short`)}
              </Badge>
              <div>
                <p className="text-sm font-medium text-[#341b55]">
                  {t(`payments.items.${method.key}.label`)}
                </p>
                <p className="text-xs text-[#9582ad]">
                  {t(`payments.items.${method.key}.description`)}
                </p>
              </div>
            </div>
            <Switch
              checked={enabledByMethod[method.method] ?? true}
              onCheckedChange={(checked) =>
                setEnabledByMethod((prev) => ({
                  ...prev,
                  [method.method]: checked,
                }))}
            />
          </div>
        ))}
      </div>

      {saveMethods.isError
        ? (
          <p className="mt-4 text-sm text-[#b24368]">
            {saveMethods.error instanceof Error
              ? saveMethods.error.message
              : String(saveMethods.error)}
          </p>
        )
        : null}

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
