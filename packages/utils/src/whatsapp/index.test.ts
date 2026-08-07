import { describe, expect, it } from "vitest";
import {
  buildWhatsAppOrderMessage,
  buildWhatsAppPaymentReminderMessage,
  buildWhatsAppUrl,
} from "./index";

describe("buildWhatsAppOrderMessage", () => {
  const base = {
    orderId: "order-abcdef",
    storeName: "K-Store",
    items: [
      { name: "Album v1", quantity: 2, unitPrice: 15 },
      { name: "Photocard", quantity: 1, unitPrice: 5 },
    ],
    totalAmount: 35,
    currency: "PEN",
    deliveryMethodType: "PICKUP",
    customerPhone: "+51999999999",
  };

  it("includes a short order ref, store name, items with currency, delivery method and total", () => {
    const message = buildWhatsAppOrderMessage(base);
    expect(message).toContain("*Nuevo pedido en K-Store*");
    expect(message).toContain("Ref: #ABCDEF");
    expect(message).toContain("2x Album v1 - 15.00 PEN c/u");
    expect(message).toContain("1x Photocard - 5.00 PEN c/u");
    expect(message).toContain("Entrega: Retiro presencial");
    expect(message).toContain("*Total: 35.00 PEN*");
  });

  it("falls back to the raw delivery method when there's no label for it", () => {
    const message = buildWhatsAppOrderMessage({
      ...base,
      deliveryMethodType: "TELEPORT",
    });
    expect(message).toContain("Entrega: TELEPORT");
  });

  it("shows the customer name when provided", () => {
    const message = buildWhatsAppOrderMessage({
      ...base,
      customerName: "Jane",
    });
    expect(message).toContain("Cliente: Jane");
  });

  it("falls back to the phone number when no name is provided", () => {
    const message = buildWhatsAppOrderMessage(base);
    expect(message).toContain("Contacto: +51999999999");
  });

  it("includes the payment method label when provided", () => {
    const message = buildWhatsAppOrderMessage({
      ...base,
      paymentMethod: "YAPE",
    });
    expect(message).toContain("Método de pago: Yape");
  });

  it("falls back to the raw payment method when there's no label for it", () => {
    const message = buildWhatsAppOrderMessage({
      ...base,
      paymentMethod: "CRYPTO",
    });
    expect(message).toContain("Método de pago: CRYPTO");
  });

  it("omits the payment method line entirely when none is provided", () => {
    const message = buildWhatsAppOrderMessage(base);
    expect(message).not.toContain("Método de pago");
  });
});

describe("buildWhatsAppPaymentReminderMessage", () => {
  const base = {
    orderId: "order-abcdef",
    storeName: "K-Store",
    pendingAmount: 12.5,
    currency: "PEN",
  };

  it("includes the short order ref, store name, and pending amount", () => {
    const message = buildWhatsAppPaymentReminderMessage(base);
    expect(message).toContain("#ABCDEF");
    expect(message).toContain("K-Store");
    expect(message).toContain("12.50 PEN");
  });

  it("greets the customer by name when provided", () => {
    const message = buildWhatsAppPaymentReminderMessage({
      ...base,
      customerName: "Jane",
    });
    expect(message).toContain("Hola Jane,");
  });

  it("falls back to a generic greeting when no name is provided", () => {
    const message = buildWhatsAppPaymentReminderMessage(base);
    expect(message).toContain("Hola,");
  });
});

describe("buildWhatsAppUrl", () => {
  it("strips non-numeric characters from the phone number", () => {
    const url = buildWhatsAppUrl("+51 999-999-999", "hello");
    expect(url).toBe("https://wa.me/51999999999?text=hello");
  });

  it("URL-encodes the message", () => {
    const url = buildWhatsAppUrl("51999999999", "line one\nline two");
    expect(url).toBe(
      `https://wa.me/51999999999?text=${
        encodeURIComponent("line one\nline two")
      }`,
    );
  });
});
