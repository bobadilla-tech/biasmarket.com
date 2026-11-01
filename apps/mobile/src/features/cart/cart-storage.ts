import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  addCartItem,
  type CartItem,
  type CartItemIdentity,
  removeCartItem,
  updateCartItemQuantity,
} from "@biasmarket/utils/cart";

const storageKey = (storeSlug: string) => `biasmarket:cart:${storeSlug}`;
const checkoutKeyStorageKey = (storeSlug: string) =>
  `biasmarket:checkout-key:${storeSlug}`;
const pendingWrites = new Map<string, Promise<CartItem[]>>();

export async function readStoreCart(storeSlug: string): Promise<CartItem[]> {
  const serialized = await AsyncStorage.getItem(storageKey(storeSlug));
  if (!serialized) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  return parsed.filter(isCartItem);
}

function isCartItem(value: unknown): value is CartItem {
  if (typeof value !== "object" || value === null) return false;
  const item = value as Partial<CartItem>;
  return (
    typeof item.productId === "string" &&
    typeof item.name === "string" &&
    typeof item.price === "number" &&
    Number.isFinite(item.price) &&
    typeof item.currency === "string" &&
    typeof item.quantity === "number" &&
    Number.isFinite(item.quantity) &&
    (item.variantId === undefined || typeof item.variantId === "string") &&
    (item.variantLabel === undefined ||
      typeof item.variantLabel === "string") &&
    (item.image === undefined || typeof item.image === "string")
  );
}

async function updateStoreCart(
  storeSlug: string,
  update: (items: CartItem[]) => CartItem[],
): Promise<CartItem[]> {
  const key = storageKey(storeSlug);
  const priorWrite = pendingWrites.get(key) ?? Promise.resolve([]);
  const nextWrite = priorWrite
    .catch(() => [])
    .then(async () => {
      const current = await readStoreCart(storeSlug);
      const next = update(current);
      await AsyncStorage.setItem(key, JSON.stringify(next));
      return next;
    });
  pendingWrites.set(key, nextWrite);
  try {
    return await nextWrite;
  } finally {
    if (pendingWrites.get(key) === nextWrite) pendingWrites.delete(key);
  }
}

export function addToStoreCart(
  storeSlug: string,
  item: CartItem,
): Promise<CartItem[]> {
  return updateStoreCart(storeSlug, (items) => addCartItem(items, item));
}

export function setStoreCartQuantity(
  storeSlug: string,
  target: CartItemIdentity,
  quantity: number,
): Promise<CartItem[]> {
  return updateStoreCart(storeSlug, (items) =>
    updateCartItemQuantity(items, target, quantity),
  );
}

export function removeFromStoreCart(
  storeSlug: string,
  target: CartItemIdentity,
): Promise<CartItem[]> {
  return updateStoreCart(storeSlug, (items) => removeCartItem(items, target));
}

export function clearStoreCart(storeSlug: string): Promise<CartItem[]> {
  return updateStoreCart(storeSlug, () => []).then(async (items) => {
    await AsyncStorage.removeItem(checkoutKeyStorageKey(storeSlug)).catch(
      () => undefined,
    );
    return items;
  });
}

export async function getCheckoutIdempotencyKey(
  storeSlug: string,
  items: readonly CartItem[],
): Promise<string> {
  const key = checkoutKeyStorageKey(storeSlug);
  const fingerprint = JSON.stringify(
    items.map(({ productId, variantId, quantity }) => ({
      productId,
      variantId: variantId ?? null,
      quantity,
    })),
  );
  const serialized = await AsyncStorage.getItem(key);
  if (serialized) {
    try {
      const existing = JSON.parse(serialized) as {
        fingerprint?: unknown;
        id?: unknown;
      };
      if (
        existing.fingerprint === fingerprint &&
        typeof existing.id === "string"
      ) {
        return existing.id;
      }
    } catch {
      // Replace an invalid record with a fresh UUID below.
    }
  }

  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  const id = `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
  await AsyncStorage.setItem(key, JSON.stringify({ fingerprint, id }));
  return id;
}
