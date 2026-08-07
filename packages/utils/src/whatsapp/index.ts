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
  pickupPointLabel?: string | null;
  pickupDate?: Date | null;
  paymentMethod?: string | null;
  customerName?: string | null;
  customerPhone: string;
}

const DELIVERY_METHOD_LABELS: Record<string, string> = {
  PICKUP: "Retiro presencial",
  COURIER: "Envío a domicilio",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  YAPE: "Yape",
  PLIN: "Plin",
  TRANSFER: "Transferencia bancaria",
  CASH: "Efectivo",
};

const shortOrderRef = (orderId: string): string =>
  orderId.slice(-6).toUpperCase();

// UTC getters deliberately, not local — the date is stored/parsed as a
// UTC-anchored midnight (see CreateOrderUseCase), so reading it back with
// local getters could shift the displayed day depending on server TZ.
const formatPickupDate = (date: Date): string => {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
};

export const buildWhatsAppOrderMessage = (
  input: WhatsAppOrderInput,
): string => {
  const lines = [
    `*Nuevo pedido en ${input.storeName}*`,
    `Ref: #${shortOrderRef(input.orderId)}`,
    "",
    ...input.items.map(
      (item) =>
        `${item.quantity}x ${item.name} - ${
          item.unitPrice.toFixed(2)
        } ${input.currency} c/u`,
    ),
    "",
    input.pickupPointLabel
      ? `Entrega: ${
        DELIVERY_METHOD_LABELS[input.deliveryMethodType] ??
          input.deliveryMethodType
      } — ${input.pickupPointLabel}`
      : `Entrega: ${
        DELIVERY_METHOD_LABELS[input.deliveryMethodType] ??
          input.deliveryMethodType
      }`,
    input.pickupDate
      ? `Fecha de recojo: ${formatPickupDate(input.pickupDate)}`
      : null,
    `*Total: ${input.totalAmount.toFixed(2)} ${input.currency}*`,
    input.paymentMethod
      ? `Método de pago: ${
        PAYMENT_METHOD_LABELS[input.paymentMethod] ?? input.paymentMethod
      }`
      : null,
    "",
    input.customerName
      ? `Cliente: ${input.customerName}`
      : `Contacto: ${input.customerPhone}`,
  ];
  return lines.filter((line): line is string => line !== null).join("\n");
};

export interface WhatsAppPaymentReminderInput {
  orderId: string;
  storeName: string;
  pendingAmount: number;
  currency: string;
  customerName?: string | null;
}

export const buildWhatsAppPaymentReminderMessage = (
  input: WhatsAppPaymentReminderInput,
): string => {
  const greeting = input.customerName ? `Hola ${input.customerName},` : "Hola,";
  const lines = [
    greeting,
    `Sobre tu pedido #${shortOrderRef(input.orderId)} en ${input.storeName}:`,
    `Todavía tenés un saldo pendiente de ${
      input.pendingAmount.toFixed(2)
    } ${input.currency}.`,
    "¿Podrías completar el pago para que podamos avanzar con tu pedido? ¡Gracias!",
  ];
  return lines.join("\n");
};

export const buildWhatsAppUrl = (
  phoneNumber: string,
  message: string,
): string => {
  const digits = phoneNumber.replace(/[^0-9]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
};
