"use client";

import { Mail, MessageCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { buildWhatsAppUrl } from "@biasmarket/utils/whatsapp";
import { usePublicStore } from "../queries/use-public-store";

// Hardcoded Spanish fallback message, not the whatsapp-templates endpoint —
// that module only supports NEW_ORDER/PAYMENT_REMINDER/ASSISTED_ORDER_LINK and 400s on anything
// else (see .artifacts/2026/08/20260808--buyer-mini-dashboard/plan.md). Matches the
// existing hardcoded-Spanish convention already used by every other message
// builder in packages/utils/src/whatsapp.
function buildContactMessage(orderId?: string, message?: string): string {
  if (message?.trim()) return message.trim();
  return orderId
    ? `Hola, tengo una consulta sobre mi pedido #${orderId.slice(0, 8)}`
    : "Hola, tengo una consulta sobre mis pedidos";
}

export function ContactSellerButton({
  slug,
  orderId,
  className,
  label,
  message,
  icon = "message",
}: {
  slug: string;
  orderId?: string;
  className?: string;
  label?: string;
  message?: string;
  icon?: "mail" | "message";
}) {
  const t = useTranslations("storefront.accountPage");
  const { data: store } = usePublicStore(slug);

  if (!store?.whatsappNumber) return null;

  return (
    <a
      href={buildWhatsAppUrl(
        store.whatsappNumber,
        buildContactMessage(orderId, message),
      )}
      target="_blank"
      rel="noopener noreferrer"
      className={
        className ??
        "inline-flex items-center gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
      }
    >
      {icon === "mail" ? (
        <Mail aria-hidden="true" className="size-4" />
      ) : (
        <MessageCircle aria-hidden="true" className="size-4" />
      )}
      {label ?? t("contactSeller")}
    </a>
  );
}
