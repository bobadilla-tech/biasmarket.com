"use client";

import { useEffect, useMemo, useState } from "react";
import { MessageCircle, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  buildWhatsAppOrderMessage,
  buildWhatsAppPaymentReminderMessage,
  getMissingRequiredTokens,
  WHATSAPP_MESSAGE_TOKENS,
  type WhatsAppMessageType,
  type WhatsAppOrderInput,
  type WhatsAppPaymentReminderInput,
} from "@biasmarket/utils/whatsapp";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useSaveWhatsAppTemplate } from "../mutations/use-save-whatsapp-template";
import { SectionCard, useSavedFlash } from "./section-primitives";

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

function MessageTemplateEditor({
  type,
  storeId,
  initialTemplate,
  title,
  description,
}: {
  type: WhatsAppMessageType;
  storeId: string;
  initialTemplate: string | null;
  title: string;
  description: string;
}) {
  const t = useTranslations("dashboard.settings.whatsappMessages");
  const saveTemplate = useSaveWhatsAppTemplate(storeId, type);
  const [text, setText] = useState(initialTemplate ?? "");

  useEffect(() => {
    setText(initialTemplate ?? "");
  }, [initialTemplate]);

  useSavedFlash(saveTemplate.isSuccess, saveTemplate.reset);

  const hasCustomTemplate = text.trim().length > 0;
  const missing = useMemo(
    () => (hasCustomTemplate ? getMissingRequiredTokens(type, text) : []),
    [type, text, hasCustomTemplate],
  );

  const preview = hasCustomTemplate
    ? type === "NEW_ORDER"
      ? buildWhatsAppOrderMessage(SAMPLE_NEW_ORDER_INPUT, text)
      : buildWhatsAppPaymentReminderMessage(SAMPLE_REMINDER_INPUT, text)
    : type === "NEW_ORDER"
      ? buildWhatsAppOrderMessage(SAMPLE_NEW_ORDER_INPUT)
      : buildWhatsAppPaymentReminderMessage(SAMPLE_REMINDER_INPUT);

  const insertToken = (token: string) => {
    setText(
      (current) =>
        `${current}${current && !current.endsWith(" ") ? " " : ""}{{${token}}}`,
    );
  };

  return (
    <div className="rounded-2xl border border-[#f0e7f8] bg-[#fcf9ff] p-4">
      <label
        htmlFor={`settings-whatsapp-${type.toLowerCase()}`}
        className="text-sm font-medium text-[#341b55]"
      >
        {title}
      </label>
      <p className="mt-1 text-xs text-[#9582ad]">{description}</p>

      <Textarea
        id={`settings-whatsapp-${type.toLowerCase()}`}
        aria-label={title}
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={6}
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

      {missing.length > 0 ? (
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
          onClick={() => saveTemplate.mutate(text)}
          disabled={!hasCustomTemplate || saveTemplate.isPending}
          className="store-theme-primary-button h-9 rounded-full px-4 text-xs font-semibold hover:opacity-100"
        >
          {saveTemplate.isSuccess
            ? t("saved")
            : saveTemplate.isPending
              ? t("saving")
              : t("save")}
        </Button>
      </div>
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
    { newOrder: string | null; paymentReminder: string | null } | undefined;
  loading: boolean;
}) {
  const t = useTranslations("dashboard.settings.whatsappMessages");

  return (
    <SectionCard
      icon={MessageCircle}
      title={t("title")}
      description={t("description")}
    >
      {loading || !templates ? (
        <p className="text-sm text-[#8f7da8]">{t("loading")}</p>
      ) : (
        <div className="space-y-4">
          <MessageTemplateEditor
            type="NEW_ORDER"
            storeId={storeId}
            initialTemplate={templates.newOrder}
            title={t("newOrder.title")}
            description={t("newOrder.description")}
          />
          <Separator className="bg-[#f0e7f8]" />
          <MessageTemplateEditor
            type="PAYMENT_REMINDER"
            storeId={storeId}
            initialTemplate={templates.paymentReminder}
            title={t("paymentReminder.title")}
            description={t("paymentReminder.description")}
          />
        </div>
      )}
    </SectionCard>
  );
}
