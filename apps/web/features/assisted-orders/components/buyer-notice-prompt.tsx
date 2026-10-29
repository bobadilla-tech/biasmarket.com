"use client";

import { useEffect, useRef, useState } from "react";
import { Copy, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { buildWhatsAppBuyerNoticeMessage } from "@biasmarket/utils/whatsapp";
import { Button } from "@/components/ui/button";
import { useOrders } from "@/features/orders/queries/use-orders";
import { isNoticeApplicable } from "../lib/buyer-notice-for-change";
import {
  setBuyerNoticeOffer,
  useCurrentBuyerNoticeOffer,
} from "../lib/buyer-notice-offer";
import { useLogBuyerNotice } from "../mutations/use-buyer-notice";
import { useBuyerNoticeTemplate } from "../queries/use-buyer-notice-template";
import { ConfirmNumberAndOpenWhatsApp } from "./confirm-number-and-open-whatsapp";

// Dismissible "Avisar al comprador" card shown after a status change on an
// assisted order. One per page: the offer is global, the page that mounts it
// owns it. The order is read live from the orders query, so a tracking number
// entered right after "En camino" is picked up before the seller sends.
export function BuyerNoticePrompt({
  storeId,
  storeName,
}: {
  storeId: string | undefined;
  storeName: string;
}) {
  const t = useTranslations("dashboard.assistedOrder.buyerNotice");
  const tCreated = useTranslations("dashboard.assistedOrder.created");
  const offer = useCurrentBuyerNoticeOffer();
  const active = offer && offer.storeId === storeId ? offer : null;
  const orders = useOrders(active?.storeId);
  const template = useBuyerNoticeTemplate(active?.storeId, active?.notice);
  const log = useLogBuyerNotice(active?.storeId ?? "");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle",
  );
  const logged = useRef<string | null>(null);

  const offerKey = active ? `${active.orderId}:${active.notice}` : null;
  useEffect(() => {
    setCopyState("idle");
    logged.current = null;
  }, [offerKey]);

  const order = active
    ? orders.data?.find((row) => row.id === active.orderId)
    : undefined;
  if (!active || !order || !isNoticeApplicable(order, active.notice)) {
    return null;
  }

  const ready = template.isSuccess || template.isError;
  const message = buildWhatsAppBuyerNoticeMessage(
    active.notice,
    {
      orderId: order.id,
      storeName,
      customerName: order.customerName ?? "",
      trackingNumber: order.trackingNumber,
      claimed: Boolean(order.claimedAt),
    },
    template.data,
  );

  // Log once per offer, whichever of WhatsApp/copy the seller uses first.
  const markSent = () => {
    if (logged.current === offerKey) return;
    logged.current = offerKey;
    log.mutate({ orderId: active.orderId, notice: active.notice });
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopyState("copied");
      markSent();
    } catch {
      setCopyState("failed");
    }
  };

  return (
    <aside
      aria-label={t("title")}
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md flex-col gap-3 rounded-2xl border border-[#eadcf8] bg-white p-4 shadow-lg sm:left-auto sm:right-4 sm:mx-0"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-[#2d1649]">{t("title")}</p>
          <p className="mt-0.5 text-xs text-[#8e7ca7]">
            {t(`reason.${active.notice}`)}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setBuyerNoticeOffer(null)}
          aria-label={t("dismiss")}
          className="-m-2 shrink-0 p-2 text-[#8e7ca7]"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      </div>

      <textarea
        readOnly
        rows={4}
        value={ready ? message : ""}
        placeholder={tCreated("templateLoading")}
        aria-label={tCreated("messageLabel")}
        onFocus={(event) => event.currentTarget.select()}
        className="w-full rounded-xl border border-input bg-[#fcf9ff] p-3 text-base text-[#341b55] md:text-sm"
      />

      {template.isError ? (
        <p role="status" className="text-xs text-[#8e7ca7]">
          {t("templateError")}
        </p>
      ) : null}

      <div className="flex flex-col gap-2 sm:flex-row">
        <ConfirmNumberAndOpenWhatsApp
          disabled={!ready}
          phone={order.customerPhone}
          message={message}
          hideFixNumber
          onFixNumber={() => undefined}
          onOpened={() => {
            markSent();
            setBuyerNoticeOffer(null);
          }}
        />
        <Button
          type="button"
          variant="outline"
          onClick={copy}
          disabled={!ready}
          className="min-h-11 rounded-2xl px-5 text-sm font-semibold"
        >
          <Copy aria-hidden="true" className="size-4" />
          {tCreated("copyMessage")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => setBuyerNoticeOffer(null)}
          className="min-h-11 rounded-2xl px-5 text-sm font-semibold"
        >
          {t("notNow")}
        </Button>
      </div>

      <div role="status" aria-live="polite" className="min-h-4 text-xs">
        {copyState === "copied" ? (
          <span className="text-[#159a63]">{tCreated("copied")}</span>
        ) : copyState === "failed" ? (
          <span className="text-[#b24368]">{tCreated("copyFailed")}</span>
        ) : null}
      </div>
    </aside>
  );
}
