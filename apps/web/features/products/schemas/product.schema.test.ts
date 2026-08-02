import { expect, test } from "vitest";
import { productSchema } from "./product.schema";

test("accepts a product with categories and variants", () => {
  const result = productSchema.safeParse({
    id: "p1",
    name: "Tee",
    description: "A tee",
    price: "10.00",
    currency: "USD",
    status: "DRAFT",
    soldOut: false,
    images: ["https://example.com/a.png"],
    availableUntil: null,
    categories: [{ category: { id: "c1", name: "Clothing" } }],
    variants: [
      {
        id: "v1",
        name: "Small",
        stock: 5,
        reserved: 0,
        priceOverride: null,
        imageOverride: null,
        attributes: { size: "S" },
      },
    ],
    availableStock: 5,
    soldUnits: 2,
  });
  expect(result.success).toBe(true);
});

test("accepts a minimal product without optional fields", () => {
  const result = productSchema.safeParse({
    id: "p1",
    name: "Tee",
    description: "",
    price: "10.00",
    currency: "USD",
    status: "PUBLISHED",
    soldOut: false,
    images: [],
    availableUntil: null,
  });
  expect(result.success).toBe(true);
});

test("rejects an invalid status", () => {
  const result = productSchema.safeParse({
    id: "p1",
    name: "Tee",
    description: "",
    price: "10.00",
    currency: "USD",
    status: "ARCHIVED",
    soldOut: false,
    images: [],
    availableUntil: null,
  });
  expect(result.success).toBe(false);
});
