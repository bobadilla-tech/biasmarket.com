import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  addCartItem,
  removeCartItem,
  updateCartItemQuantity,
  type CartItem,
  type CartItemIdentity,
} from "@biasmarket/utils/cart";

const storageKey = (storeSlug: string) => `biasmarket:cart:${storeSlug}`;
const pendingWrites = new Map<string, Promise<CartItem[]>>();

export async function readStoreCart(storeSlug: string): Promise<CartItem[]> {
  try {
    const serialized = await AsyncStorage.getItem(storageKey(storeSlug));
    if (!serialized) return [];
    const parsed: unknown = JSON.parse(serialized);
    return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch {
    return [];
  }
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
