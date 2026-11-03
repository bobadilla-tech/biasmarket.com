"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  buildWhatsAppAssistedOrderLinkMessage,
  buildWhatsAppBuyerNoticeMessage,
  buildWhatsAppOrderMessage,
  buildWhatsAppPaymentReminderMessage,
  getMissingRequiredTokens,
  WHATSAPP_MESSAGE_TOKENS,
  WHATSAPP_DEFAULT_TEMPLATES,
  type WhatsAppAssistedOrderLinkInput,
  type WhatsAppBuyerNoticeInput,
  type WhatsAppBuyerNoticeType,
  type WhatsAppMessageType,
  type WhatsAppOrderInput,
  type WhatsAppPaymentReminderInput,
} from "@biasmarket/utils/whatsapp";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { useSaveWhatsAppTemplate } from "../mutations/use-save-whatsapp-template";
import { SectionCard, useSavedFlash } from "./section-primitives";
import { useSettingsDraftParticipant } from "./settings-save-context";

const SAMPLE_NEW_ORDER_INPUT: WhatsAppOrderInput = {
  orderId: "sample-order-123456",
  storeName: "K-Store",
  items: [
    { name: "Álbum v1", quantity: 2, unitPrice: 15 },
    { name: "Photocard", quantity: 1, unitPrice: 5 },
  ],
  totalAmount: 35,
  currency: "PEN",
  deliveryMethodType: "PICKUP",
  pickupPointLabel: "Alameda 28 de Julio",
  pickupDate: new Date("2026-08-15T00:00:00Z"),
  paymentMethod: "YAPE",
  customerName: "Cliente Ejemplo",
  customerPhone: "+51999999999",
};

const SAMPLE_REMINDER_INPUT: WhatsAppPaymentReminderInput = {
  orderId: "sample-order-123456",
  storeName: "K-Store",
  pendingAmount: 12.5,
  currency: "PEN",
  customerName: "Cliente Ejemplo",
};

const SAMPLE_ASSISTED_LINK_INPUT: WhatsAppAssistedOrderLinkInput = {
  orderId: "sample-order-123456",
  storeName: "K-Store",
  totalAmount: 35,
  currency: "PEN",
  customerName: "Cliente Ejemplo",
  link: "https://biasmarket.com/es/store/k-store/pedido/enlace-de-ejemplo",
};

const SAMPLE_BUYER_NOTICE_INPUT: WhatsAppBuyerNoticeInput = {
  orderId: "sample-order-123456",
  storeName: "K-Store",
  customerName: "Cliente Ejemplo",
  trackingNumber: "OLV-123456",
};

// Order of the editors under the assisted-order link editor, and the
// templates/i18n key each one uses.
const BUYER_NOTICE_EDITORS: readonly {
  type: WhatsAppBuyerNoticeType;
  key: "paymentValidated" | "inTransit" | "ready" | "delivered";
}[] = [
  { type: "ASSISTED_PAYMENT_VALIDATED", key: "paymentValidated" },
  { type: "ASSISTED_IN_TRANSIT", key: "inTransit" },
  { type: "ASSISTED_READY", key: "ready" },
  { type: "ASSISTED_DELIVERED", key: "delivered" },
];

// Exhaustive on purpose: adding a message type without a preview fails to compile.
function buildPreview(type: WhatsAppMessageType, template?: string): string {
  switch (type) {
    case "NEW_ORDER":
      return buildWhatsAppOrderMessage(SAMPLE_NEW_ORDER_INPUT, template);
    case "PAYMENT_REMINDER":
      return buildWhatsAppPaymentReminderMessage(
        SAMPLE_REMINDER_INPUT,
        template,
      );
    case "ASSISTED_ORDER_LINK":
      return buildWhatsAppAssistedOrderLinkMessage(
        SAMPLE_ASSISTED_LINK_INPUT,
        template,
      );
    case "ASSISTED_PAYMENT_VALIDATED":
    case "ASSISTED_IN_TRANSIT":
    case "ASSISTED_READY":
    case "ASSISTED_DELIVERED":
      return buildWhatsAppBuyerNoticeMessage(
        type,
        SAMPLE_BUYER_NOTICE_INPUT,
        template,
      );
  }
}

function MessageTemplateEditor({
  type,
  storeId,
  initialTemplate,
  title,
  description,
  isOpen,
  onToggle,
}: {
  type: WhatsAppMessageType;
  storeId: string;
  initialTemplate: string | null;
  title: string;
  description: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("dashboard.settings.whatsappMessages");
  const saveTemplate = useSaveWhatsAppTemplate(storeId, type);
  const savedTemplate = initialTemplate || WHATSAPP_DEFAULT_TEMPLATES[type];
  const [text, setText] = useState(savedTemplate);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    setText(initialTemplate || WHATSAPP_DEFAULT_TEMPLATES[type]);
  }, [initialTemplate, type]);

  useSavedFlash(saveTemplate.isSuccess, saveTemplate.reset);

  const draftIsCustom =
    text.trim().length > 0 && text !== WHATSAPP_DEFAULT_TEMPLATES[type];
  const savedIsCustom = savedTemplate !== WHATSAPP_DEFAULT_TEMPLATES[type];
  const missing = useMemo(
    () => getMissingRequiredTokens(type, text),
    [type, text],
  );

  const preview = buildPreview(type, draftIsCustom ? text : undefined);
  const saveDraft = useCallback(async () => {
    if (text.length > 1000) {
      throw new Error(t("templateTooLong"));
    }
    if (text.trim().length > 0 && missing.length > 0) {
      throw new Error(t("missingTokens", { tokens: missing.join(", ") }));
    }
    await saveTemplate.mutateAsync(draftIsCustom ? text : "");
  }, [draftIsCustom, missing, saveTemplate, t, text]);
  const discardDraft = useCallback(
    () => setText(savedTemplate),
    [savedTemplate],
  );
  useSettingsDraftParticipant({
    id: `whatsapp-${type}`,
    tab: "messages",
    dirty: text !== savedTemplate,
    valid:
      text.length <= 1000 && (text.trim().length === 0 || missing.length === 0),
    validationError:
      text.length > 1000
        ? t("templateTooLong")
        : t("missingTokens", { tokens: missing.join(", ") }),
    save: saveDraft,
    discard: discardDraft,
  });

  const insertToken = (token: string) => {
    const textarea = textareaRef.current;
    const start = textarea?.selectionStart ?? text.length;
    const end = textarea?.selectionEnd ?? text.length;
    const insertion = `{{${token}}}`;
    const next = `${text.slice(0, start)}${insertion}${text.slice(end)}`;
    if (next.length > 1000) return;
    setText(next);
    requestAnimationFrame(() => {
      textarea?.focus();
      textarea?.setSelectionRange(
        start + insertion.length,
        start + insertion.length,
      );
    });
  };

  return (
    <div className="rounded-2xl border border-[#f0e7f8] bg-[#fcf9ff]">
      <button
        type="button"
        aria-expanded={isOpen}
        onClick={onToggle}
        className="flex min-h-14 w-full items-center justify-between gap-3 px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a45cc]"
      >
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-[#341b55]">
            {title}
          </span>
          <span className="mt-0.5 block text-xs text-[#9582ad]">
            {description}
          </span>
        </span>
        <Badge className="shrink-0 rounded-full bg-white text-[#72558e]">
          {savedIsCustom ? t("customized") : t("defaultLabel")}
        </Badge>
      </button>

      {isOpen ? (
        <div className="border-t border-[#f0e7f8] p-4">
          <Textarea
            ref={textareaRef}
            id={`settings-whatsapp-${type.toLowerCase()}`}
            aria-label={title}
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={saveTemplate.isPending}
            rows={6}
            maxLength={1000}
            placeholder={t("emptyHint")}
            className="mt-3 rounded-2xl border-[#e7dcf3] bg-white text-sm text-[#341b55] shadow-none"
          />

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#927fac]">
              {t("variablesLabel")}
            </span>
            {WHATSAPP_MESSAGE_TOKENS[type].map((token) => (
              <button
                key={token}
                type="button"
                disabled={saveTemplate.isPending}
                aria-label={t("insertVariable", { token: `{{${token}}}` })}
                onClick={() => insertToken(token)}
                className="inline-flex items-center gap-1 rounded-full border border-[#eadcf7] bg-white px-2.5 py-1 font-mono text-[11px] text-[#8f7da8] transition-colors hover:border-[#d8c6ee] hover:text-[#5a3d82]"
                title={t("insertVariable", { token: `{{${token}}}` })}
              >
                <Plus className="size-2.5" />
                {`{{${token}}}`}
              </button>
            ))}
          </div>

          <p className="mt-1 text-right text-xs tabular-nums text-[#9582ad]">
            {text.length}/1000
          </p>
          {text.length > 1000 ? (
            <p role="alert" className="mt-1 text-xs text-[#b24368]">
              {t("templateTooLong")}
            </p>
          ) : null}

          {text.trim().length > 0 && missing.length > 0 ? (
            <p className="mt-3 text-sm text-[#b24368]">
              {t("missingTokens", {
                tokens: missing.map((token) => `{{${token}}}`).join(", "),
              })}
            </p>
          ) : null}

          {saveTemplate.isError ? (
            <p className="mt-3 text-sm text-[#b24368]">
              {saveTemplate.error instanceof Error
                ? saveTemplate.error.message
                : String(saveTemplate.error)}
            </p>
          ) : null}

          <div className="mt-3">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#927fac]">
              {t("previewLabel")}
            </p>
            <pre className="mt-1.5 max-h-48 overflow-auto whitespace-pre-wrap rounded-xl border border-[#eadcf7] bg-white p-3 font-mono text-xs leading-relaxed text-[#5a3d82]">
              {preview}
            </pre>
          </div>

          <div className="mt-3 flex items-center justify-end">
            <Button
              type="button"
              variant="ghost"
              disabled={saveTemplate.isPending}
              onClick={() => setText(WHATSAPP_DEFAULT_TEMPLATES[type])}
              className="mr-auto h-9 rounded-full px-3 text-xs"
            >
              {t("restoreDefault")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function WhatsAppMessagesSection({
  storeId,
  templates,
  loading,
}: {
  storeId: string;
  templates:
    | {
        newOrder: string | null;
        paymentReminder: string | null;
        assistedOrderLink: string | null;
        paymentValidated: string | null;
        inTransit: string | null;
        ready: string | null;
        delivered: string | null;
      }
    | undefined;
  loading: boolean;
}) {
  const t = useTranslations("dashboard.settings.whatsappMessages");
  const [openMessage, setOpenMessage] = useState<WhatsAppMessageType | null>(
    "NEW_ORDER",
  );

  return (
    <SectionCard
      icon={MessageCircle}
      title={t("title")}
      description={t("description")}
    >
      {loading || !templates ? (
        <p className="text-sm text-[#8f7da8]">{t("loading")}</p>
      ) : (
        <div className="space-y-3">
          <details
            open
            className="rounded-2xl border border-[#eadcf7] bg-white px-4"
          >
            <summary className="cursor-pointer py-4 text-sm font-semibold text-[#341b55]">
              {t("groups.orders")}
            </summary>
            <div className="space-y-3 pb-4">
              <MessageTemplateEditor
                type="NEW_ORDER"
                storeId={storeId}
                initialTemplate={templates.newOrder}
                title={t("newOrder.title")}
                description={t("newOrder.description")}
                isOpen={openMessage === "NEW_ORDER"}
                onToggle={() =>
                  setOpenMessage(
                    openMessage === "NEW_ORDER" ? null : "NEW_ORDER",
                  )
                }
              />
              <MessageTemplateEditor
                type="ASSISTED_ORDER_LINK"
                storeId={storeId}
                initialTemplate={templates.assistedOrderLink}
                title={t("assistedOrderLink.title")}
                description={t("assistedOrderLink.description")}
                isOpen={openMessage === "ASSISTED_ORDER_LINK"}
                onToggle={() =>
                  setOpenMessage(
                    openMessage === "ASSISTED_ORDER_LINK"
                      ? null
                      : "ASSISTED_ORDER_LINK",
                  )
                }
              />
            </div>
          </details>
          <details
            open
            className="rounded-2xl border border-[#eadcf7] bg-white px-4"
          >
            <summary className="cursor-pointer py-4 text-sm font-semibold text-[#341b55]">
              {t("groups.payments")}
            </summary>
            <div className="space-y-3 pb-4">
              <MessageTemplateEditor
                type="PAYMENT_REMINDER"
                storeId={storeId}
                initialTemplate={templates.paymentReminder}
                title={t("paymentReminder.title")}
                description={t("paymentReminder.description")}
                isOpen={openMessage === "PAYMENT_REMINDER"}
                onToggle={() =>
                  setOpenMessage(
                    openMessage === "PAYMENT_REMINDER"
                      ? null
                      : "PAYMENT_REMINDER",
                  )
                }
              />
              {BUYER_NOTICE_EDITORS.slice(0, 1).map(({ type, key }) => (
                <MessageTemplateEditor
                  key={type}
                  type={type}
                  storeId={storeId}
                  initialTemplate={templates[key]}
                  title={t(`buyerNotices.${key}.title`)}
                  description={t(`buyerNotices.${key}.description`)}
                  isOpen={openMessage === type}
                  onToggle={() =>
                    setOpenMessage(openMessage === type ? null : type)
                  }
                />
              ))}
            </div>
          </details>
          <details
            open
            className="rounded-2xl border border-[#eadcf7] bg-white px-4"
          >
            <summary className="cursor-pointer py-4 text-sm font-semibold text-[#341b55]">
              {t("groups.tracking")}
            </summary>
            <div className="space-y-3 pb-4">
              {BUYER_NOTICE_EDITORS.slice(1).map(({ type, key }) => (
                <MessageTemplateEditor
                  key={type}
                  type={type}
                  storeId={storeId}
                  initialTemplate={templates[key]}
                  title={t(`buyerNotices.${key}.title`)}
                  description={t(`buyerNotices.${key}.description`)}
                  isOpen={openMessage === type}
                  onToggle={() =>
                    setOpenMessage(openMessage === type ? null : type)
                  }
                />
              ))}
            </div>
          </details>
        </div>
      )}
    </SectionCard>
  );
}
