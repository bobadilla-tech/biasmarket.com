import {
  buildWhatsAppAssistedOrderLinkMessage,
  buildWhatsAppUrl,
} from "@biasmarket/utils/whatsapp";

// The default (or the seller's saved ASSISTED_ORDER_LINK template) rendered
// with the order that was just created. `customerName` is "" when the seller
// gave no alias, so the greeting stays clean. The order ref in the message is
// the shared `orderRef`, built inside the message builder.
export function buildAssistedLinkMessage(input: {
  order: {
    id: string;
    customerName: string | null;
    totalAmount: string;
    currency: string;
  };
  storeName: string;
  accessUrl: string;
  template: string | null | undefined;
}): string {
  return buildWhatsAppAssistedOrderLinkMessage(
    {
      orderId: input.order.id,
      storeName: input.storeName,
      totalAmount: Number(input.order.totalAmount),
      currency: input.order.currency,
      customerName: input.order.customerName ?? "",
      link: input.accessUrl,
    },
    input.template,
  );
}

export function buildAssistedLinkWhatsAppUrl(
  phone: string,
  message: string,
): string {
  return buildWhatsAppUrl(phone, message);
}
