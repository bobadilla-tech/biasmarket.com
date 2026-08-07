import { expect, test } from "vitest";
import { isProductOutOfStock } from "./product-stock";

test("soldOut flag alone marks the product out of stock", () => {
  expect(isProductOutOfStock({ soldOut: true, variants: [] })).toBe(true);
});

test("a product with no variants and soldOut false is in stock", () => {
  expect(isProductOutOfStock({ soldOut: false, variants: [] })).toBe(false);
});

test("in stock when at least one variant has available stock", () => {
  expect(isProductOutOfStock({
    soldOut: false,
    variants: [
      { stock: 0, reserved: 0 },
      { stock: 5, reserved: 2 },
    ],
  })).toBe(false);
});

test("out of stock when every variant is depleted (stock - reserved <= 0)", () => {
  expect(isProductOutOfStock({
    soldOut: false,
    variants: [
      { stock: 3, reserved: 3 },
      { stock: 1, reserved: 4 },
    ],
  })).toBe(true);
});

test("a null stock variant (unlimited) is always available", () => {
  expect(isProductOutOfStock({
    soldOut: false,
    variants: [{ stock: null, reserved: 999 }],
  })).toBe(false);
});
