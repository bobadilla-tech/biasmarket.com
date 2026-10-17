import { describe, expect, it } from "vitest";
import { DEFAULT_TRACE_RATE, tracesSampler } from "./index";

function sample(name: string, parentSampled?: boolean) {
  return tracesSampler({
    name,
    parentSampled,
    inheritOrSampleWith: (fallback) =>
      typeof parentSampled === "boolean" ? Number(parentSampled) : fallback,
  });
}

describe("tracesSampler", () => {
  it("never traces health probes or static assets", () => {
    expect(sample("GET /api/health")).toBe(0);
    expect(sample("GET /health")).toBe(0);
    expect(sample("GET /_next/static/chunks/app.js")).toBe(0);
  });

  it("drops a health probe even when the parent was sampled", () => {
    expect(sample("GET /api/health", true)).toBe(0);
  });

  it("keeps every money and order path", () => {
    expect(sample("POST /api/stores/:slug/checkout")).toBe(1);
    expect(sample("POST /api/public/orders/:token/payments")).toBe(1);
    expect(sample("GET /api/stores/:storeId/orders")).toBe(1);
    expect(sample("POST /internal/orders/expire")).toBe(1);
    expect(sample("GET /es/store/[slug]/pedido/[token]")).toBe(1);
  });

  it("samples an ordinary route at the default rate", () => {
    expect(sample("GET /api/stores/:storeId/products")).toBe(
      DEFAULT_TRACE_RATE,
    );
    expect(sample("GET /es/store/[slug]")).toBe(DEFAULT_TRACE_RATE);
  });

  it("samples image optimisation below the default rate", () => {
    expect(sample("GET /_next/image")).toBeLessThan(DEFAULT_TRACE_RATE);
  });

  it("inherits the parent decision so a trace is kept or dropped whole", () => {
    expect(sample("GET /api/stores/:storeId/products", true)).toBe(1);
    expect(sample("GET /api/stores/:storeId/products", false)).toBe(0);
    expect(sample("POST /api/stores/:slug/checkout", false)).toBe(0);
  });
});
