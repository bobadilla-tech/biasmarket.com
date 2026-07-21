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
  currency: string;
  deliveryMethodType: string;
  customerName?: string | null;
  customerPhone: string;
}

const DELIVERY_METHOD_LABELS: Record<string, string> = {
  PICKUP: "Retiro en tienda",
  COURIER: "Envío a domicilio",
};

const shortOrderRef = (orderId: string): string => orderId.slice(-6).toUpperCase();

export const buildWhatsAppOrderMessage = (input: WhatsAppOrderInput): string => {
  const lines = [
    `*Nuevo pedido en ${input.storeName}*`,
    `Ref: #${shortOrderRef(input.orderId)}`,
    "",
    ...input.items.map(
      (item) =>
        `${item.quantity}x ${item.name} - ${item.unitPrice.toFixed(2)} ${input.currency} c/u`,
    ),
    "",
    `Entrega: ${DELIVERY_METHOD_LABELS[input.deliveryMethodType] ?? input.deliveryMethodType}`,
    `*Total: ${input.totalAmount.toFixed(2)} ${input.currency}*`,
    "",
    input.customerName ? `Cliente: ${input.customerName}` : `Contacto: ${input.customerPhone}`,
  ];
  return lines.join("\n");
};

export const buildWhatsAppUrl = (phoneNumber: string, message: string): string => {
  const digits = phoneNumber.replace(/[^0-9]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
};
