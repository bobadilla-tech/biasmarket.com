import { describe, expect, test } from "vitest";
import type { ProductDetailResponseDto } from "@biasmarket/types";
import { getPublishedCatalogValue } from "./catalog-value";

function product(
  overrides: Partial<ProductDetailResponseDto>,
): ProductDetailResponseDto {
  return {
    id: "p1",
    storeId: "s1",
    name: "Test",
    description: "",
    price: "10.00",
    currency: "PEN",
    images: [],
    availableUntil: null,
    status: "PUBLISHED",
    soldOut: false,
    discontinued: false,
    deletedAt: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    variants: [],
    categories: [],
    soldUnits: 0,
    availableStock: null,
    ...overrides,
  };
}

describe("getPublishedCatalogValue", () => {
  test("returns 0 for an empty catalog", () => {
    expect(getPublishedCatalogValue([], "PEN")).toBe(0);
  });

  test("sums unit prices of published products", () => {
    const products = [
      product({ id: "p1", price: "10.00" }),
      product({ id: "p2", price: "40.00" }),
    ];

    expect(getPublishedCatalogValue(products, "PEN")).toBe(50);
  });

  test("excludes drafts", () => {
    const products = [
      product({ id: "p1", price: "10.00" }),
      product({ id: "p2", price: "40.00", status: "DRAFT" }),
    ];

    expect(getPublishedCatalogValue(products, "PEN")).toBe(10);
  });

  test("excludes products in a different currency", () => {
    const products = [
      product({ id: "p1", price: "10.00", currency: "PEN" }),
      product({ id: "p2", price: "40.00", currency: "USD" }),
    ];

    expect(getPublishedCatalogValue(products, "PEN")).toBe(10);
  });

  test("parses Decimal-serialized string prices", () => {
    const products = [
      product({ id: "p1", price: "10.50" }),
      product({ id: "p2", price: "40.25" }),
    ];

    expect(getPublishedCatalogValue(products, "PEN")).toBe(50.75);
  });
});
