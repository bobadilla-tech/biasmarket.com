import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  addCartItem,
  type CartItem,
  type CartItemIdentity,
  removeCartItem,
  updateCartItemQuantity,
} from "@biasmarket/utils/cart";

const storageKey = (storeSlug: string) => `biasmarket:cart:${storeSlug}`;
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
  return updateStoreCart(storeSlug, () => []);
}
