"use client";

import { useMemo, useState } from "react";
import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import type { CreateAssistedOrderResponseDto } from "@biasmarket/types";
import { Button } from "@/components/ui/button";
import { getOrderNumber } from "@/features/orders/lib/order-format";
import { useAssistedLinkTemplate } from "../queries/use-assisted-link-template";
import { buildAssistedLinkMessage } from "../lib/assisted-link-message";
import { ConfirmNumberAndOpenWhatsApp } from "./confirm-number-and-open-whatsapp";

// Shown right after creation. The private link exists only in this response,
// so it is held in component state, rendered as text, and never written to
// storage, the URL, a redirect or the query cache. It is deliberately not an
// anchor: opening it as the seller would stamp the first open and lock number
// correction before the buyer ever saw it.
export function CreatedOrderScreen({
  storeId,
  storeName,
  created,
  onFixNumber,
  onCreateAnother,
}: {
  storeId: string;
  storeName: string;
  created: CreateAssistedOrderResponseDto;
  onFixNumber: () => void;
  onCreateAnother: () => void;
}) {
  const t = useTranslations("dashboard.assistedOrder.created");
  const template = useAssistedLinkTemplate(storeId);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  const { order, accessUrl } = created;
  const message = useMemo(
    () =>
      buildAssistedLinkMessage({
        order,
        storeName,
        accessUrl,
        template: template.data,
      }),
    [order, storeName, accessUrl, template.data],
  );
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  const ready = template.isSuccess || template.isError;

  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-[#f0e7f8] bg-white p-4 sm:p-5">
      <p className="text-sm font-medium text-[#6b5a85]">
        {t("summary", {
          ref: getOrderNumber(order.id),
          total: `${order.currency} ${order.totalAmount}`,
        })}
      </p>

      <div className="flex flex-col gap-2">
        <label
          htmlFor="assisted-link-message"
          className="text-sm font-semibold text-[#2d1649]"
        >
          {t("messageLabel")}
        </label>
        <p className="text-xs text-[#8e7ca7]">{t("messageDescription")}</p>
        {ready ? (
          <textarea
            id="assisted-link-message"
            readOnly
            rows={6}
            value={message}
            onFocus={(event) => event.currentTarget.select()}
            className="w-full rounded-xl border border-input bg-[#fcf9ff] p-3 text-base text-[#341b55] select-all md:text-sm"
          />
        ) : (
          <p role="status" className="text-sm text-[#8e7ca7]">
            {t("templateLoading")}
          </p>
        )}
      </div>

      <p role="note" className="text-sm font-medium text-[#b24368]">
        {t("linkNotice")}
      </p>

      <div className="flex flex-col gap-2 sm:flex-row">
        <ConfirmNumberAndOpenWhatsApp
          disabled={!ready}
          phone={order.customerPhone}
          message={message}
          onFixNumber={onFixNumber}
        />
        <Button
          type="button"
          variant="outline"
          onClick={copy}
          disabled={!ready}
          className="min-h-11 rounded-2xl px-5 text-sm font-semibold"
        >
          <Copy aria-hidden="true" className="size-4" />
          {t("copyMessage")}
        </Button>
      </div>

      <div role="status" aria-live="polite" className="min-h-5 text-sm">
        {copyState === "copied" ? (
          <span className="text-[#159a63]">{t("copied")}</span>
        ) : copyState === "failed" ? (
          <span className="text-[#b24368]">{t("copyFailed")}</span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-4 border-t border-[#f0e7f8] pt-3 text-sm">
        <button
          type="button"
          onClick={onCreateAnother}
          className="min-h-11 font-medium text-[#5a3d82] underline"
        >
          {t("newOrder")}
        </button>
      </div>
    </section>
  );
}
