import { beforeEach, describe, expect, it } from "vitest";
import { type CartItem, addToCart, getCart, removeItem } from "./cart";

const slug = "test-store";

function makeItem(
  overrides: Partial<CartItem> = {},
): CartItem {
  return {
    productId: "p1",
    variantId: "v1",
    name: "Album",
    variantLabel: "UNIQUE",
    price: 10,
    currency: "USD",
    quantity: 1,
    ...overrides,
  };
}

beforeEach(() => {
  globalThis.localStorage.clear();
});

describe("removeItem", () => {
  it("removes only the targeted item", () => {
    const shirt = makeItem({ productId: "p1", variantId: "v1", name: "Shirt" });
    const cap = makeItem({ productId: "p2", variantId: "v2", name: "Cap" });
    addToCart(slug, shirt);
    addToCart(slug, cap);

    const next = removeItem(slug, shirt);

    expect(next).toEqual([cap]);
    expect(getCart(slug)).toEqual([cap]);
  });

  it("removes items without a variant", () => {
    const plain = makeItem({ variantId: undefined });
    addToCart(slug, plain);

    const next = removeItem(slug, plain);

    expect(next).toEqual([]);
  });

  it("is a no-op when the item is not in the cart", () => {
    const shirt = makeItem({ productId: "p1", variantId: "v1" });
    const other = makeItem({ productId: "p2", variantId: "v2" });
    addToCart(slug, other);

    const next = removeItem(slug, shirt);

    expect(next).toEqual([other]);
  });
});
