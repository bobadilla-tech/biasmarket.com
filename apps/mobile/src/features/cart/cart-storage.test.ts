import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = new Map<string, string>();

vi.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => void storage.set(key, value),
  },
}));

import {
  addToStoreCart,
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

beforeEach(() => storage.clear());

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
});
