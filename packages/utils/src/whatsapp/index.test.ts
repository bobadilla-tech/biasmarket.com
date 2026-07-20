import { describe, expect, it } from "vitest";
import { buildWhatsAppOrderMessage, buildWhatsAppUrl } from "./index";

describe("buildWhatsAppOrderMessage", () => {
  const base = {
    orderId: "order-1",
    storeName: "K-Store",
    items: [
      { name: "Album v1", quantity: 2, unitPrice: 15 },
      { name: "Photocard", quantity: 1, unitPrice: 5 },
    ],
    totalAmount: 35,
    deliveryMethodType: "PICKUP",
    customerPhone: "+51999999999",
  };

  it("includes order id, store name, items, delivery method and total", () => {
    const message = buildWhatsAppOrderMessage(base);
    expect(message).toContain("Pedido #order-1 - K-Store");
    expect(message).toContain("- 2x Album v1 ($15.00 c/u)");
    expect(message).toContain("- 1x Photocard ($5.00 c/u)");
    expect(message).toContain("Entrega: PICKUP");
    expect(message).toContain("Total: $35.00");
  });

  it("shows the customer name when provided", () => {
    const message = buildWhatsAppOrderMessage({ ...base, customerName: "Jane" });
    expect(message).toContain("Cliente: Jane");
  });

  it("falls back to the phone number when no name is provided", () => {
    const message = buildWhatsAppOrderMessage(base);
    expect(message).toContain("Contacto: +51999999999");
  });
});

describe("buildWhatsAppUrl", () => {
  it("strips non-numeric characters from the phone number", () => {
    const url = buildWhatsAppUrl("+51 999-999-999", "hello");
    expect(url).toBe("https://wa.me/51999999999?text=hello");
  });

  it("URL-encodes the message", () => {
    const url = buildWhatsAppUrl("51999999999", "line one\nline two");
    expect(url).toBe(`https://wa.me/51999999999?text=${encodeURIComponent("line one\nline two")}`);
  });
});
