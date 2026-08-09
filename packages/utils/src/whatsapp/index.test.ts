import { describe, expect, it } from "vitest";
import {
  buildWhatsAppOrderMessage,
  buildWhatsAppPaymentReminderMessage,
  buildWhatsAppUrl,
  extractTokens,
  getMissingRequiredTokens,
  renderWhatsAppTemplate,
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

  it("includes the pickup date, formatted DD/MM/YYYY from UTC, when provided", () => {
    const message = buildWhatsAppOrderMessage({
      ...base,
      pickupDate: new Date("2026-08-10T00:00:00Z"),
    });
    expect(message).toContain("Fecha de recojo: 10/08/2026");
  });

  it("omits the pickup date line entirely when none is provided", () => {
    const message = buildWhatsAppOrderMessage(base);
    expect(message).not.toContain("Fecha de recojo");
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

describe("extractTokens", () => {
  it("extracts distinct tokens in first-appearance order", () => {
    expect(
      extractTokens(
        "Hola {{customerName}}, pedido {{orderRef}} en {{storeName}} otra vez {{customerName}}",
      ),
    ).toEqual(["customerName", "orderRef", "storeName"]);
  });

  it("tolerates whitespace inside the braces", () => {
    expect(extractTokens("{{ orderRef }} y {{items}}")).toEqual([
      "orderRef",
      "items",
    ]);
  });

  it("returns an empty array for a template with no tokens", () => {
    expect(extractTokens("sin variables")).toEqual([]);
  });

  it("ignores unmatched braces and non-identifier characters", () => {
    expect(extractTokens("{{foo-bar}} {{foo bar}} {{}} {{}}")).toEqual([]);
  });
});

describe("getMissingRequiredTokens", () => {
  it("NEW_ORDER requires orderRef and items", () => {
    expect(getMissingRequiredTokens("NEW_ORDER", "{{orderRef}} {{items}}"))
      .toEqual([]);
    expect(getMissingRequiredTokens("NEW_ORDER", "solo {{items}}"))
      .toEqual(["orderRef"]);
    expect(getMissingRequiredTokens("NEW_ORDER", "sin variables"))
      .toEqual(["orderRef", "items"]);
  });

  it("PAYMENT_REMINDER requires orderRef and pendingAmount", () => {
    expect(
      getMissingRequiredTokens(
        "PAYMENT_REMINDER",
        "{{orderRef}} {{pendingAmount}}",
      ),
    ).toEqual([]);
    expect(getMissingRequiredTokens("PAYMENT_REMINDER", "{{orderRef}}"))
      .toEqual(["pendingAmount"]);
  });

  it("treats whitespace-padded tokens as present", () => {
    expect(getMissingRequiredTokens("NEW_ORDER", "{{ orderRef }} {{ items }}"))
      .toEqual([]);
  });
});

describe("renderWhatsAppTemplate", () => {
  it("substitutes known tokens and leaves unknown ones literal", () => {
    expect(
      renderWhatsAppTemplate(
        "Hola {{customerName}}, tu pedido {{orderRef}} es {{fooBar}}",
        { customerName: "Jane", orderRef: "#ABCDEF" },
      ),
    ).toBe("Hola Jane, tu pedido #ABCDEF es {{fooBar}}");
  });

  it("substitutes whitespace-padded tokens the same way it validates them", () => {
    expect(
      renderWhatsAppTemplate("Ref {{ orderRef }}", { orderRef: "#ABC123" }),
    ).toBe("Ref #ABC123");
  });
});

describe("buildWhatsAppOrderMessage with a custom template", () => {
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

  it("renders a template with the same tokenizer validation uses", () => {
    const message = buildWhatsAppOrderMessage(
      base,
      "*Nuevo pedido en {{storeName}}* #{{orderRef}}\n{{items}}\nTotal: {{totalAmount}} {{currency}}",
    );
    expect(message).toContain("*Nuevo pedido en K-Store*");
    expect(message).toContain("#ABCDEF");
    expect(message).toContain("2x Album v1 - 15.00 PEN c/u");
    expect(message).toContain("Total: 35.00 PEN");
  });

  it("falls back to the exact default string when no template is provided", () => {
    expect(buildWhatsAppOrderMessage(base)).toBe(
      buildWhatsAppOrderMessage(base, null),
    );
    expect(buildWhatsAppOrderMessage(base)).toContain("Ref: #ABCDEF");
  });

  it("ignores a blank/whitespace-only template and uses the default", () => {
    expect(buildWhatsAppOrderMessage(base, "   ")).toBe(
      buildWhatsAppOrderMessage(base),
    );
  });

  it("renders optional fields as empty strings when absent", () => {
    const message = buildWhatsAppOrderMessage(
      base,
      "Punto:{{pickupPoint}}|Fecha:{{pickupDate}}|Pago:{{paymentMethod}}|Cliente:{{customerName}}",
    );
    expect(message).toBe("Punto:|Fecha:|Pago:|Cliente:");
  });

  it("exposes delivery method and pickup label tokens", () => {
    const message = buildWhatsAppOrderMessage(
      {
        ...base,
        pickupPointLabel: "Alameda 28 de Julio",
        pickupDate: new Date("2026-08-10T00:00:00Z"),
        paymentMethod: "YAPE",
      },
      "{{deliveryMethod}}|{{pickupPoint}}|{{pickupDate}}|{{paymentMethod}}",
    );
    expect(message).toBe(
      "Retiro presencial|Alameda 28 de Julio|10/08/2026|Yape",
    );
  });

  it("substitutes the customer phone fallback token", () => {
    const message = buildWhatsAppOrderMessage(
      base,
      "Contacto {{customerPhone}}",
    );
    expect(message).toBe("Contacto +51999999999");
  });
});

describe("buildWhatsAppPaymentReminderMessage with a custom template", () => {
  const base = {
    orderId: "order-abcdef",
    storeName: "K-Store",
    pendingAmount: 12.5,
    currency: "PEN",
  };

  it("renders a template using the same tokenizer", () => {
    const message = buildWhatsAppPaymentReminderMessage(
      base,
      "Hola {{customerName}}, debes {{pendingAmount}} {{currency}} del pedido {{orderRef}} en {{storeName}}.",
    );
    expect(message).toBe(
      "Hola , debes 12.50 PEN del pedido #ABCDEF en K-Store.",
    );
  });

  it("falls back to the exact default string when no template is provided", () => {
    expect(buildWhatsAppPaymentReminderMessage(base)).toBe(
      buildWhatsAppPaymentReminderMessage(base, null),
    );
    expect(buildWhatsAppPaymentReminderMessage(base)).toContain("#ABCDEF");
  });

  it("substitutes an empty customerName when none is provided", () => {
    const message = buildWhatsAppPaymentReminderMessage(
      base,
      "Hola {{customerName}}",
    );
    expect(message).toBe("Hola ");
  });
});
