import { describe, expect, test } from "vitest";
import {
  buildAssistedLinkMessage,
  buildAssistedLinkWhatsAppUrl,
  sameOriginHref,
} from "./assisted-link-message";

const link = "https://biasmarket.com/es/store/k/pedido/tok_-1";
const order = {
  id: "order-abcdef",
  customerName: "Sofi",
  totalAmount: "50.00",
  currency: "PEN",
};

describe("buildAssistedLinkMessage", () => {
  test("default message greets by alias and carries ref, store, total and link", () => {
    const message = buildAssistedLinkMessage({
      order,
      storeName: "K-Store",
      accessUrl: link,
      template: null,
    });
    expect(message).toContain("¡Hola Sofi! 💜");
    expect(message).toContain("#ABCDEF");
    expect(message).toContain("K-Store");
    expect(message).toContain("50.00 PEN");
    expect(message.endsWith(link)).toBe(true);
  });

  test("no alias gives a clean greeting", () => {
    const message = buildAssistedLinkMessage({
      order: { ...order, customerName: null },
      storeName: "K-Store",
      accessUrl: link,
      template: undefined,
    });
    expect(message.startsWith("¡Hola! 💜")).toBe(true);
  });

  test("uses the seller's saved template when there is one", () => {
    expect(
      buildAssistedLinkMessage({
        order,
        storeName: "K-Store",
        accessUrl: link,
        template: "Tu pedido {{orderRef}}: {{link}}",
      }),
    ).toBe(`Tu pedido #ABCDEF: ${link}`);
  });

  test("the wa.me URL targets the digits of the phone and encodes the text", () => {
    const url = buildAssistedLinkWhatsAppUrl(
      "+51987654321",
      "Hola & ¡qué tal? #1",
    );
    expect(url).toBe(
      `https://wa.me/51987654321?text=${encodeURIComponent("Hola & ¡qué tal? #1")}`,
    );
  });
});

describe("sameOriginHref", () => {
  test("accepts only the app's own origin", () => {
    expect(sameOriginHref(link, "https://biasmarket.com")).toBe(link);
    expect(sameOriginHref(link, "https://evil.example")).toBeNull();
    expect(
      sameOriginHref("javascript:alert(1)", "https://biasmarket.com"),
    ).toBeNull();
    expect(sameOriginHref("not a url", "https://biasmarket.com")).toBeNull();
  });
});
