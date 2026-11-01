import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();
let failWrites = false;
let failRemovals = false;

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      if (failWrites) throw new Error("write failed");
      storage.set(key, value);
    },
    removeItem: async (key: string) => {
      if (failRemovals) throw new Error("remove failed");
      storage.delete(key);
    },
  },
}));

import {
  addToStoreCart,
  clearStoreCart,
  getCheckoutIdempotencyKey,
  removeFromStoreCart,
  readStoreCart,
  setStoreCartQuantity,
} from "./cart-storage";

const item = {
  productId: "p1",
  name: "Album",
  price: 20,
  currency: "PEN",
  quantity: 1,
};

beforeEach(() => {
  storage.clear();
  failWrites = false;
  failRemovals = false;
});

describe("device cart storage", () => {
  it("persists cart contents across reads and keeps stores separate", async () => {
    await addToStoreCart("store-a", item);
    await addToStoreCart("store-b", { ...item, productId: "p2" });

    expect(await readStoreCart("store-a")).toEqual([item]);
    expect(await readStoreCart("store-b")).toEqual([
      {
        ...item,
        productId: "p2",
      },
    ]);
  });

  it("rehydrates persisted cart contents after the app module restarts", async () => {
    await addToStoreCart("store-a", item);

    vi.resetModules();
    const restartedStorage = await import("./cart-storage");

    expect(await restartedStorage.readStoreCart("store-a")).toEqual([item]);
  });

  it("serializes rapid quantity updates without losing cart items", async () => {
    await addToStoreCart("store-a", item);
    await Promise.all([
      addToStoreCart("store-a", { ...item, productId: "p2" }),
      setStoreCartQuantity("store-a", item, 3),
    ]);

    expect(await readStoreCart("store-a")).toEqual([
      { ...item, quantity: 3 },
      { ...item, productId: "p2" },
    ]);
  });

  it("returns an empty cart for missing or invalid persisted data", async () => {
    expect(await readStoreCart("missing")).toEqual([]);
    storage.set("biasmarket:cart:invalid-json", "{");
    storage.set(
      "biasmarket:cart:not-an-array",
      JSON.stringify({ productId: "p1" }),
    );
    storage.set(
      "biasmarket:cart:invalid-items",
      JSON.stringify([
        null,
        4,
        { ...item, price: Number.NaN },
        { ...item, quantity: "1" },
        { ...item, variantId: 3 },
        { ...item, variantLabel: false },
        { ...item, image: {} },
        item,
      ]),
    );

    expect(await readStoreCart("invalid-json")).toEqual([]);
    expect(await readStoreCart("not-an-array")).toEqual([]);
    expect(await readStoreCart("invalid-items")).toEqual([item]);
  });

  it("removes a matching cart item and clears checkout state with the cart", async () => {
    await addToStoreCart("store-a", item);
    await addToStoreCart("store-a", { ...item, productId: "p2" });
    await getCheckoutIdempotencyKey("store-a", [item]);

    expect(await removeFromStoreCart("store-a", { productId: "p1" })).toEqual([
      { ...item, productId: "p2" },
    ]);
    expect(await clearStoreCart("store-a")).toEqual([]);
    expect(storage.has("biasmarket:checkout-key:store-a")).toBe(false);
  });

  it("continues clearing the cart if checkout-key removal fails", async () => {
    await addToStoreCart("store-a", item);
    failRemovals = true;

    expect(await clearStoreCart("store-a")).toEqual([]);
  });

  it("recovers from a rejected cart write before applying the next update", async () => {
    failWrites = true;
    await expect(addToStoreCart("store-a", item)).rejects.toThrow(
      "write failed",
    );
    failWrites = false;

    expect(await addToStoreCart("store-a", item)).toEqual([item]);
  });

  it("reuses a checkout key for the same cart and replaces it when the cart changes", async () => {
    const firstKey = await getCheckoutIdempotencyKey("store-a", [item]);
    expect(firstKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(await getCheckoutIdempotencyKey("store-a", [item])).toBe(firstKey);

    const changedCartKey = await getCheckoutIdempotencyKey("store-a", [
      { ...item, quantity: 2 },
    ]);
    expect(changedCartKey).not.toBe(firstKey);
  });

  it("replaces malformed or incomplete checkout-key records", async () => {
    storage.set("biasmarket:checkout-key:broken", "{");
    const generatedAfterParseFailure = await getCheckoutIdempotencyKey(
      "broken",
      [item],
    );
    expect(generatedAfterParseFailure).toMatch(/^[0-9a-f-]{36}$/);

    storage.set(
      "biasmarket:checkout-key:incomplete",
      JSON.stringify({ fingerprint: "different", id: 7 }),
    );
    const generatedAfterMismatch = await getCheckoutIdempotencyKey(
      "incomplete",
      [item],
    );
    expect(generatedAfterMismatch).toMatch(/^[0-9a-f-]{36}$/);
    expect(generatedAfterMismatch).not.toBe(generatedAfterParseFailure);
  });
});
