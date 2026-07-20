export interface WhatsAppOrderItem {
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface WhatsAppOrderInput {
  orderId: string;
  storeName: string;
  items: WhatsAppOrderItem[];
  totalAmount: number;
  deliveryMethodType: string;
  customerName?: string | null;
  customerPhone: string;
}

export const buildWhatsAppOrderMessage = (input: WhatsAppOrderInput): string => {
  const lines = [
    `Pedido #${input.orderId} - ${input.storeName}`,
    ...input.items.map(
      (item) => `- ${item.quantity}x ${item.name} ($${item.unitPrice.toFixed(2)} c/u)`,
    ),
    `Entrega: ${input.deliveryMethodType}`,
    `Total: $${input.totalAmount.toFixed(2)}`,
    input.customerName ? `Cliente: ${input.customerName}` : `Contacto: ${input.customerPhone}`,
  ];
  return lines.join("\n");
};

export const buildWhatsAppUrl = (phoneNumber: string, message: string): string => {
  const digits = phoneNumber.replace(/[^0-9]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
};
