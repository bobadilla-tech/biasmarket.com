"use client";

import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CreateAssistedOrderResponseDto } from "@biasmarket/types";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getOrderNumber } from "@/features/orders/lib/order-format";
import { buildCreateOrderSuccessMessage } from "../lib/assisted-link-message";
import { useAssistedLinkTemplate } from "../queries/use-assisted-link-template";
import { LinkMessagePanel } from "./link-message-panel";

// Shown once, on desktop and mobile, after the order exists. The private link
// stays in this response only: text the seller can copy, never an anchor and
// never written to storage.
export function CreatedOrderModal({
  storeId,
  storeName,
  created,
  onClose,
  onFixNumber,
}: {
  storeId: string;
  storeName: string;
  created: CreateAssistedOrderResponseDto | null;
  onClose: () => void;
  onFixNumber: () => void;
}) {
  const t = useTranslations("dashboard.assistedOrder.created");
  const template = useAssistedLinkTemplate(storeId);
  const [linkCopy, setLinkCopy] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  const message = useMemo(() => {
    if (!created) return "";
    return buildCreateOrderSuccessMessage({
      order: created.order,
      storeName,
      accessUrl: created.accessUrl,
      template: template.data,
    });
  }, [created, storeName, template.data]);

  const copyLink = async () => {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.accessUrl);
      setLinkCopy("copied");
    } catch {
      setLinkCopy("failed");
    }
  };

  return (
    <Dialog
      open={created !== null}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) onClose();
      }}
    >
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-[#e9f8ef] text-[#159a63]">
            <Check aria-hidden="true" className="size-6" />
          </div>
          <DialogTitle className="text-center text-xl text-[#2d1649]">
            {t("title")}
          </DialogTitle>
          <DialogDescription className="text-center">
            {t("subtitle")}
          </DialogDescription>
        </DialogHeader>
        {created ? (
          <div className="flex flex-col gap-4">
            <p className="mx-auto rounded-full bg-[#f7f0ff] px-3 py-1 text-sm font-semibold text-[#5a3d82]">
              {t("summary", {
                ref: getOrderNumber(created.order.id),
                total: `${created.order.currency} ${created.order.totalAmount}`,
              })}
            </p>
            {!created.isPaymentMethodConfigured ? (
              <p
                role="status"
                className="rounded-xl bg-[#fff5e9] p-3 text-sm text-[#8a4b12]"
              >
                {t("paymentMethodNotConfigured")}
              </p>
            ) : null}
            <div className="flex items-center gap-2">
              <p className="min-w-0 flex-1 truncate text-sm text-[#341b55]">
                {created.accessUrl}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => void copyLink()}
                className="min-h-11 shrink-0 rounded-xl"
              >
                <Copy aria-hidden="true" className="size-4" />
                {t("copyLink")}
              </Button>
            </div>
            <p role="status" className="min-h-5 text-sm">
              {linkCopy === "copied" ? (
                <span className="text-[#159a63]">{t("linkCopied")}</span>
              ) : linkCopy === "failed" ? (
                <span className="text-[#b24368]">{t("copyFailed")}</span>
              ) : null}
            </p>
            <LinkMessagePanel
              message={message}
              phone={created.order.customerPhone}
              ready={template.isSuccess || template.isError}
              onFixNumber={onFixNumber}
            />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
