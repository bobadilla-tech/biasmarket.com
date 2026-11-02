import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();
let failWrites = false;
let failRemovals = false;
let writeFailuresRemaining = 0;

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      if (failWrites) throw new Error("write failed");
      if (writeFailuresRemaining > 0) {
        writeFailuresRemaining--;
        throw new Error("transient write failed");
      }
      storage.set(key, value);
    },
    removeItem: async (key: string) => {
      if (failRemovals) throw new Error("remove failed");
      storage.delete(key);
    },
  },
}));

vi.mock("expo-crypto", () => ({
  getRandomValues: <T extends ArrayBufferView | null>(array: T): T => {
    if (array) {
      globalThis.crypto.getRandomValues(array as any);
    }
    return array;
  },
}));

import {
  addToStoreCart,
  clearCheckoutIdempotencyKey,
  clearStoreCart,
  getCheckoutIdempotencyKey,
  markCheckoutIdempotencyKeyDone,
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
  writeFailuresRemaining = 0;
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

  it("clears checkout idempotency key independently", async () => {
    await getCheckoutIdempotencyKey("store-a", [item]);
    expect(storage.has("biasmarket:checkout-key:store-a")).toBe(true);
    await clearCheckoutIdempotencyKey("store-a");
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

  it("includes variantId in the checkout fingerprint", async () => {
    const firstKey = await getCheckoutIdempotencyKey("store-a", [
      { ...item, variantId: "red" },
    ]);
    const nextKey = await getCheckoutIdempotencyKey("store-a", [
      { ...item, variantId: "blue" },
    ]);
    expect(nextKey).not.toBe(firstKey);
  });

  it("serializes concurrent key reads for one store", async () => {
    const [first, second] = await Promise.all([
      getCheckoutIdempotencyKey("store-a", [item]),
      getCheckoutIdempotencyKey("store-a", [item]),
    ]);
    expect(second).toBe(first);
  });

  it("replaces old versions and done records with a new key", async () => {
    storage.set(
      "biasmarket:checkout-key:old-version",
      JSON.stringify({ v: 2, id: "old", fingerprint: "same" }),
    );
    const oldVersionKey = await getCheckoutIdempotencyKey("old-version", [
      item,
    ]);
    expect(oldVersionKey).not.toBe("old");

    const completedKey = await getCheckoutIdempotencyKey("completed", [item]);
    await markCheckoutIdempotencyKeyDone("completed", [item], completedKey);
    const nextKey = await getCheckoutIdempotencyKey("completed", [item]);
    expect(nextKey).not.toBe(completedKey);
  });

  it("retries a done-marker write once", async () => {
    const key = await getCheckoutIdempotencyKey("store-a", [item]);
    writeFailuresRemaining = 1;

    await markCheckoutIdempotencyKeyDone("store-a", [item], key);

    expect(
      JSON.parse(storage.get("biasmarket:checkout-key:store-a")!).done,
    ).toBe(true);
    expect(writeFailuresRemaining).toBe(0);
  });

  it("keeps the done marker if cart clearing fails", async () => {
    await addToStoreCart("store-a", item);
    const key = await getCheckoutIdempotencyKey("store-a", [item]);
    await markCheckoutIdempotencyKeyDone("store-a", [item], key);
    failWrites = true;

    await expect(clearStoreCart("store-a")).rejects.toThrow("write failed");
    expect(
      JSON.parse(storage.get("biasmarket:checkout-key:store-a")!).done,
    ).toBe(true);
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

  it("clears a stored checkout key", async () => {
    const key = await getCheckoutIdempotencyKey("store-a", [item]);
    expect(await getCheckoutIdempotencyKey("store-a", [item])).toBe(key);
    await clearCheckoutIdempotencyKey("store-a");
    const nextKey = await getCheckoutIdempotencyKey("store-a", [item]);
    expect(nextKey).not.toBe(key);
  });
});
