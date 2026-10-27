"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { ConfirmNumberAndOpenWhatsApp } from "./confirm-number-and-open-whatsapp";

// The buyer message with its send/copy actions. Shared by the created screen
// and the order detail, so both confirm the number before WhatsApp opens and
// both keep the text selectable if the clipboard is unavailable. The message
// carries the private link, which is shown as text only.
export function LinkMessagePanel({
  message,
  phone,
  ready,
  onFixNumber,
}: {
  message: string;
  phone: string;
  ready: boolean;
  onFixNumber: () => void;
}) {
  const t = useTranslations("dashboard.assistedOrder.created");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <>
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
          phone={phone}
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
    </>
  );
}
