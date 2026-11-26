import { orderRef } from "@biasmarket/utils/order-ref";
import {
  buildWhatsAppAssistedOrderLinkMessage,
  buildWhatsAppUrl,
} from "@biasmarket/utils/whatsapp";

type AssistedLinkInput = {
  order: {
    id: string;
    customerName: string | null;
    totalAmount: string;
    currency: string;
  };
  storeName: string;
  accessUrl: string;
  template: string | null | undefined;
};

function assistedLinkVariables(input: AssistedLinkInput) {
  return {
    orderId: input.order.id,
    storeName: input.storeName,
    totalAmount: Number(input.order.totalAmount),
    currency: input.order.currency,
    customerName: input.order.customerName ?? "",
    link: input.accessUrl,
  };
}

// The shared assisted-order template, or the seller's saved override. Used
// when an existing order regenerates its buyer link.
export function buildAssistedLinkMessage(input: AssistedLinkInput): string {
  return buildWhatsAppAssistedOrderLinkMessage(
    assistedLinkVariables(input),
    input.template,
  );
}

// Copy for the "Pedido creado" modal. Issue #458 specifies this sentence.
// A saved ASSISTED_ORDER_LINK template still wins; otherwise this text is
// used instead of the shared assisted-order default.
export function buildCreateOrderSuccessMessage(
  input: AssistedLinkInput,
): string {
  const template = input.template?.trim();
  if (template) {
    return buildWhatsAppAssistedOrderLinkMessage(
      assistedLinkVariables(input),
      template,
    );
  }
  const name = input.order.customerName?.trim();
  const greeting = name ? `¡Hola ${name}!` : "¡Hola!";
  return `${greeting} Preparé tu pedido #${orderRef(input.order.id)} en ${input.storeName} por ${input.order.totalAmount} ${input.order.currency}. Aquí puedes ver el detalle de tu compra:\n${input.accessUrl}`;
}

export function buildAssistedLinkWhatsAppUrl(
  phone: string,
  message: string,
): string {
  return buildWhatsAppUrl(phone, message);
}
