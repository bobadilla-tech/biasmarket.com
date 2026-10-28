import { describe, expect, it } from "vitest";
import { redactPublicOrderToken, redactSentryEvent } from "./sentry-redaction";

describe("public order token redaction", () => {
  it("redacts the token of a locale-prefixed buyer page URL", () => {
    expect(
      redactPublicOrderToken(
        "https://biasmarket.com/es/store/tienda/pedido/tok_ABC123?x=1",
      ),
    ).toBe("https://biasmarket.com/es/store/tienda/pedido/[redacted]?x=1");
  });

  it("redacts the token when the proxy served the unprefixed path", () => {
    expect(redactPublicOrderToken("/store/tienda/pedido/tok_ABC123")).toBe(
      "/store/tienda/pedido/[redacted]",
    );
  });

  it("redacts the token of the API call behind the page", () => {
    expect(
      redactPublicOrderToken(
        "http://localhost:3000/api/public/orders/tok_ABC123",
      ),
    ).toBe("http://localhost:3000/api/public/orders/[redacted]");
  });

  it("only replaces the token segment and leaves the rest untouched", () => {
    expect(
      redactPublicOrderToken("/es/store/tienda/pedido/tok_ABC/retry"),
    ).toBe("/es/store/tienda/pedido/[redacted]/retry");
  });

  it("leaves unrelated URLs alone", () => {
    expect(
      redactPublicOrderToken("https://biasmarket.com/es/store/tienda"),
    ).toBe("https://biasmarket.com/es/store/tienda");
    expect(redactPublicOrderToken("https://api.example/health")).toBe(
      "https://api.example/health",
    );
  });
});

describe("redactSentryEvent", () => {
  it("redacts the token in place, at any depth", () => {
    const event = {
      request: { url: "/es/store/tienda/pedido/tok_ABC123" },
      breadcrumbs: [
        { data: { to: "/es/store/tienda/pedido/tok_ABC123" } },
        { data: { to: "/es/store/tienda" } },
      ],
      message: "failed for /es/store/tienda/pedido/tok_ABC123",
    };

    redactSentryEvent(event);

    expect(event.request.url).toBe("/es/store/tienda/pedido/[redacted]");
    expect(event.breadcrumbs[0].data.to).toBe(
      "/es/store/tienda/pedido/[redacted]",
    );
    expect(event.breadcrumbs[1].data.to).toBe("/es/store/tienda");
    expect(event.message).toBe("failed for /es/store/tienda/pedido/[redacted]");
  });

  it("tolerates empty values and non-string leaves", () => {
    const event = { retries: 2, ok: true, nested: null, list: [1, "x"] };

    expect(() => redactSentryEvent(event)).not.toThrow();
    expect(() => redactSentryEvent(null)).not.toThrow();
    expect(() => redactSentryEvent(undefined)).not.toThrow();
    expect(event).toMatchObject({ retries: 2, ok: true, nested: null });
  });
});
