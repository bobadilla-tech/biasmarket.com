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

export interface WhatsAppPaymentReminderInput {
  orderId: string;
  storeName: string;
  pendingAmount: number;
  currency: string;
  customerName?: string | null;
}

export interface WhatsAppAssistedOrderLinkInput {
  orderId: string;
  storeName: string;
  totalAmount: number;
  currency: string;
  // Callers pass "" (or null) when the seller gave no alias.
  customerName?: string | null;
  link: string;
}

// One notice per step the seller can tell an assisted-order buyer about. There
// is no "packed" notice: no fulfillment status exists for it.
export const WHATSAPP_BUYER_NOTICE_TYPES = [
  "ASSISTED_PAYMENT_VALIDATED",
  "ASSISTED_IN_TRANSIT",
  "ASSISTED_READY",
  "ASSISTED_DELIVERED",
] as const;

export type WhatsAppBuyerNoticeType =
  (typeof WHATSAPP_BUYER_NOTICE_TYPES)[number];

export type WhatsAppMessageType =
  | "NEW_ORDER"
  | "PAYMENT_REMINDER"
  | "ASSISTED_ORDER_LINK"
  | WhatsAppBuyerNoticeType;

export interface WhatsAppBuyerNoticeInput {
  orderId: string;
  storeName: string;
  // Callers pass "" (or null) when the seller gave no alias.
  customerName?: string | null;
  // Only used by the in-transit notice.
  trackingNumber?: string | null;
  // The order was already saved to a buyer account: no "save it" sentence.
  claimed?: boolean;
}

// Single source of truth for the template token syntax — `{{token}}` with
// optional surrounding whitespace inside the braces. Both token validation and
// substitution go through `createTokenRegex()` (one tokenizer, not two
// independently-written regexes), so a template that passes validation can
// never render with a literal, unsubstituted `{{token}}` left in the message.
const createTokenRegex = (): RegExp => /\{\{\s*([A-Za-z0-9_]+)\s*\}\}/g;

// Required-variable enforcement per message type (see the plan doc — a
// message that drops critical info, like the order reference or the itemized
// products, must be rejected at save time, not discovered after it's sent).
export const WHATSAPP_REQUIRED_TOKENS: Record<
  WhatsAppMessageType,
  readonly string[]
> = {
  NEW_ORDER: ["orderRef", "items"],
  PAYMENT_REMINDER: ["orderRef", "pendingAmount"],
  ASSISTED_ORDER_LINK: ["link"],
  ASSISTED_PAYMENT_VALIDATED: [],
  ASSISTED_IN_TRANSIT: [],
  ASSISTED_READY: [],
  ASSISTED_DELIVERED: [],
};

// Every token available to a template of each type, for the settings UI's
// inline variable hints. Always a superset of WHATSAPP_REQUIRED_TOKENS[type].
export const WHATSAPP_MESSAGE_TOKENS: Record<
  WhatsAppMessageType,
  readonly string[]
> = {
  NEW_ORDER: [
    "orderRef",
    "storeName",
    "items",
    "totalAmount",
    "currency",
    "deliveryMethod",
    "pickupPoint",
    "pickupDate",
    "paymentMethod",
    "customerName",
    "customerPhone",
  ],
  PAYMENT_REMINDER: [
    "orderRef",
    "storeName",
    "pendingAmount",
    "currency",
    "customerName",
  ],
  ASSISTED_ORDER_LINK: [
    "link",
    "customerName",
    "storeName",
    "orderRef",
    "totalAmount",
    "currency",
  ],
  ASSISTED_PAYMENT_VALIDATED: [
    "customerName",
    "storeName",
    "orderRef",
    "saveInvite",
  ],
  ASSISTED_IN_TRANSIT: [
    "customerName",
    "storeName",
    "orderRef",
    "trackingNumber",
  ],
  ASSISTED_READY: ["customerName", "storeName", "orderRef"],
  ASSISTED_DELIVERED: ["customerName", "storeName", "orderRef", "saveInvite"],
};

// The one tokenizer. Returns every distinct `{{token}}` name in a template,
// in first-appearance order, duplicates removed.
export const extractTokens = (template: string): string[] => {
  const found: string[] = [];
  const seen = new Set<string>();
  const regex = createTokenRegex();
  let match: RegExpExecArray | null;
  while ((match = regex.exec(template)) !== null) {
    const name = match[1]!;
    if (!seen.has(name)) {
      seen.add(name);
      found.push(name);
    }
  }
  return found;
};

export const getMissingRequiredTokens = (
  type: WhatsAppMessageType,
  template: string,
): string[] => {
  const present = new Set(extractTokens(template));
  return WHATSAPP_REQUIRED_TOKENS[type].filter((token) => !present.has(token));
};

// Unknown tokens (`{{fooBar}}`) are left literal in the output — a seller who
// mistypes a token should see the mistake in the message they send, not have
// it silently stripped.
export const renderWhatsAppTemplate = (
  template: string,
  variables: Record<string, string>,
): string =>
  template.replace(
    createTokenRegex(),
    (match, name: string) => variables[name] ?? match,
  );

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

// Variables available to a NEW_ORDER template. `items` is pre-rendered as a
// single block (the plan's explicit non-goal: no nested per-item templating).
const orderMessageVariables = (
  input: WhatsAppOrderInput,
): Record<string, string> => ({
  orderRef: `#${shortOrderRef(input.orderId)}`,
  storeName: input.storeName,
  items: input.items
    .map(
      (item) =>
        `${item.quantity}x ${item.name} - ${item.unitPrice.toFixed(
          2,
        )} ${input.currency} c/u`,
    )
    .join("\n"),
  totalAmount: input.totalAmount.toFixed(2),
  currency: input.currency,
  deliveryMethod:
    DELIVERY_METHOD_LABELS[input.deliveryMethodType] ??
    input.deliveryMethodType,
  pickupPoint: input.pickupPointLabel ?? "",
  pickupDate: input.pickupDate ? formatPickupDate(input.pickupDate) : "",
  paymentMethod: input.paymentMethod
    ? (PAYMENT_METHOD_LABELS[input.paymentMethod] ?? input.paymentMethod)
    : "",
  customerName: input.customerName ?? "",
  customerPhone: input.customerPhone,
});

const buildDefaultOrderMessage = (input: WhatsAppOrderInput): string => {
  const lines = [
    `*Nuevo pedido en ${input.storeName}*`,
    `Ref: #${shortOrderRef(input.orderId)}`,
    "",
    ...input.items.map(
      (item) =>
        `${item.quantity}x ${item.name} - ${item.unitPrice.toFixed(
          2,
        )} ${input.currency} c/u`,
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

// `template` is a per-store override saved via the whatsapp-templates module;
// when absent (a store with no override row) the existing hardcoded string is
// used unchanged — today's exact output for every existing caller.
export const buildWhatsAppOrderMessage = (
  input: WhatsAppOrderInput,
  template?: string | null,
): string => {
  if (template && template.trim().length > 0) {
    return renderWhatsAppTemplate(template, orderMessageVariables(input));
  }
  return buildDefaultOrderMessage(input);
};

const paymentReminderVariables = (
  input: WhatsAppPaymentReminderInput,
): Record<string, string> => ({
  orderRef: `#${shortOrderRef(input.orderId)}`,
  storeName: input.storeName,
  pendingAmount: input.pendingAmount.toFixed(2),
  currency: input.currency,
  customerName: input.customerName ?? "",
});

const buildDefaultPaymentReminderMessage = (
  input: WhatsAppPaymentReminderInput,
): string => {
  const greeting = input.customerName ? `Hola ${input.customerName},` : "Hola,";
  const lines = [
    greeting,
    `Sobre tu pedido #${shortOrderRef(input.orderId)} en ${input.storeName}:`,
    `Todavía tenés un saldo pendiente de ${input.pendingAmount.toFixed(
      2,
    )} ${input.currency}.`,
    "¿Podrías completar el pago para que podamos avanzar con tu pedido? ¡Gracias!",
  ];
  return lines.join("\n");
};

export const buildWhatsAppPaymentReminderMessage = (
  input: WhatsAppPaymentReminderInput,
  template?: string | null,
): string => {
  if (template && template.trim().length > 0) {
    return renderWhatsAppTemplate(template, paymentReminderVariables(input));
  }
  return buildDefaultPaymentReminderMessage(input);
};

const assistedOrderLinkVariables = (
  input: WhatsAppAssistedOrderLinkInput,
): Record<string, string> => ({
  link: input.link,
  customerName: input.customerName ?? "",
  storeName: input.storeName,
  orderRef: `#${shortOrderRef(input.orderId)}`,
  totalAmount: input.totalAmount.toFixed(2),
  currency: input.currency,
});

// The greeting is chosen here, in code, so an absent alias reads "¡Hola! 💜"
// and never "¡Hola ! 💜". Custom templates render exactly as written.
const buildDefaultAssistedOrderLinkMessage = (
  input: WhatsAppAssistedOrderLinkInput,
): string => {
  const alias = input.customerName?.trim();
  const lines = [
    alias ? `¡Hola ${alias}! 💜` : "¡Hola! 💜",
    `Preparé tu pedido #${shortOrderRef(input.orderId)} en ${input.storeName} por ${input.totalAmount.toFixed(
      2,
    )} ${input.currency}.`,
    "Aquí puedes ver el detalle y cómo pagar:",
    input.link,
  ];
  return lines.join("\n");
};

export const buildWhatsAppAssistedOrderLinkMessage = (
  input: WhatsAppAssistedOrderLinkInput,
  template?: string | null,
): string => {
  if (template && template.trim().length > 0) {
    return renderWhatsAppTemplate(template, assistedOrderLinkVariables(input));
  }
  return buildDefaultAssistedOrderLinkMessage(input);
};

// ---- Buyer notices (assisted orders) -------------------------------------
// These messages carry no link: the buyer already has the private one, and a
// new link would invalidate it. The "save your order" sentence points at that
// same link and is dropped once the order is claimed.

const BUYER_NOTICE_SAVE_INVITE =
  "Si quieres, puedes guardar tu pedido con tu cuenta de Google desde el mismo enlace que te enviamos.";

const buyerNoticeVariables = (
  input: WhatsAppBuyerNoticeInput,
): Record<string, string> => ({
  customerName: input.customerName ?? "",
  storeName: input.storeName,
  orderRef: `#${shortOrderRef(input.orderId)}`,
  trackingNumber: input.trackingNumber?.trim() ?? "",
  saveInvite: input.claimed ? "" : BUYER_NOTICE_SAVE_INVITE,
});

const buildDefaultBuyerNoticeMessage = (
  type: WhatsAppBuyerNoticeType,
  input: WhatsAppBuyerNoticeInput,
): string => {
  const alias = input.customerName?.trim();
  const ref = `#${shortOrderRef(input.orderId)}`;
  const tracking = input.trackingNumber?.trim();
  const save = input.claimed ? null : BUYER_NOTICE_SAVE_INVITE;
  const lines: (string | null)[] = [alias ? `¡Hola ${alias}! 💜` : "¡Hola! 💜"];
  switch (type) {
    case "ASSISTED_PAYMENT_VALIDATED":
      lines.push(
        `Validamos tu pago del pedido ${ref} en ${input.storeName}. ✅`,
        save,
      );
      break;
    case "ASSISTED_IN_TRANSIT":
      lines.push(
        `Tu pedido ${ref} de ${input.storeName} ya va en camino. 🚚`,
        tracking ? `Código de seguimiento: ${tracking}` : null,
      );
      break;
    case "ASSISTED_READY":
      lines.push(`Tu pedido ${ref} de ${input.storeName} ya está listo. 🎉`);
      break;
    case "ASSISTED_DELIVERED":
      lines.push(
        `Tu pedido ${ref} de ${input.storeName} figura como entregado. ¡Gracias por tu compra! 💜`,
        save,
      );
      break;
  }
  return lines.filter((line): line is string => Boolean(line)).join("\n");
};

export const buildWhatsAppBuyerNoticeMessage = (
  type: WhatsAppBuyerNoticeType,
  input: WhatsAppBuyerNoticeInput,
  template?: string | null,
): string => {
  if (template && template.trim().length > 0) {
    return renderWhatsAppTemplate(template, buyerNoticeVariables(input));
  }
  return buildDefaultBuyerNoticeMessage(type, input);
};

export const buildWhatsAppUrl = (
  phoneNumber: string,
  message: string,
): string => {
  const digits = phoneNumber.replace(/[^0-9]/g, "");
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
};
