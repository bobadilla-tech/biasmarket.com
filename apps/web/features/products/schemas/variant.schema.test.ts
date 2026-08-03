import { expect, test } from "vitest";
import { variantSchema } from "./variant.schema";

test("accepts a variant with attributes and overrides", () => {
  const result = variantSchema.safeParse({
    id: "v1",
    name: "Red / M",
    stock: 3,
    reserved: 1,
    priceOverride: "12.50",
    imageOverride: "https://example.com/v1.png",
    attributes: { color: "Red", size: "M" },
  });
  expect(result.success).toBe(true);
});

test("accepts null stock, priceOverride, and imageOverride", () => {
  const result = variantSchema.safeParse({
    id: "v1",
    name: "Default",
    stock: null,
    reserved: 0,
    priceOverride: null,
    imageOverride: null,
    attributes: {},
  });
  expect(result.success).toBe(true);
});
