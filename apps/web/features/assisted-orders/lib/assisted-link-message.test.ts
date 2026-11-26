import { describe, expect, test } from "vitest";
import {
  buildAssistedLinkMessage,
  buildAssistedLinkWhatsAppUrl,
  buildCreateOrderSuccessMessage,
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

  test("create-order success copy uses the issue sentence, not the shared template", () => {
    const message = buildCreateOrderSuccessMessage({
      order,
      storeName: "K-Store",
      accessUrl: link,
      template: null,
    });
    expect(message).toBe(
      `¡Hola Sofi! Preparé tu pedido #ABCDEF en K-Store por 50.00 PEN. Aquí puedes ver el detalle de tu compra:\n${link}`,
    );
    expect(message).not.toContain("💜");
    expect(message).not.toContain("cómo pagar");
  });

  test("a blank name keeps the success sentence from greeting nobody", () => {
    const message = buildCreateOrderSuccessMessage({
      order: { ...order, customerName: "  " },
      storeName: "K-Store",
      accessUrl: link,
      template: null,
    });
    expect(message.startsWith("¡Hola! Preparé tu pedido #ABCDEF")).toBe(true);
  });

  test("a saved template still replaces the create-order success sentence", () => {
    expect(
      buildCreateOrderSuccessMessage({
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
      `https://wa.me/51987654321?text=${encodeURIComponent(
        "Hola & ¡qué tal? #1",
      )}`,
    );
  });
});
