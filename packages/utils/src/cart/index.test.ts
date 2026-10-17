import { describe, expect, it } from "vitest";
import {
  addCartItem,
  cartCount,
  cartCurrency,
  type CartItem,
  cartTotal,
  hasMixedCurrencies,
  removeCartItem,
  updateCartItemQuantity,
} from "./index";

const item = (overrides: Partial<CartItem> = {}): CartItem => ({
  productId: "album",
  variantId: "standard",
  name: "Album",
  price: 12.5,
  currency: "PEN",
  quantity: 1,
  ...overrides,
});

describe("shared cart operations", () => {
  it("adds matching variants by increasing quantity", () => {
    expect(addCartItem([item()], item({ quantity: 2 }))).toEqual([
      item({ quantity: 3 }),
    ]);
  });

  it("keeps different variants as separate lines", () => {
    expect(addCartItem([item()], item({ variantId: "deluxe" }))).toHaveLength(
      2,
    );
  });

  it("updates quantity and removes an item when quantity reaches zero", () => {
    expect(updateCartItemQuantity([item()], item(), 4)).toEqual([
      item({ quantity: 4 }),
    ]);
    expect(updateCartItemQuantity([item()], item(), 0)).toEqual([]);
  });

  it("removes only the matching product variant", () => {
    expect(
      removeCartItem([item(), item({ variantId: "deluxe" })], item()),
    ).toEqual([item({ variantId: "deluxe" })]);
  });

  it("calculates totals, count, and mixed-currency status", () => {
    const items = [item({ quantity: 2 }), item({ currency: "USD", price: 3 })];
    expect(cartTotal(items)).toBe(28);
    expect(cartCount(items)).toBe(3);
    expect(cartCurrency(items)).toBeNull();
    expect(hasMixedCurrencies(items)).toBe(true);
  });
});
