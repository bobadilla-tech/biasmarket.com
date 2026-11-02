import AsyncStorage from "@react-native-async-storage/async-storage";
import { getRandomValues } from "expo-crypto";
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
const pendingCheckoutKeyWrites = new Map<string, Promise<void>>();

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
    await clearCheckoutIdempotencyKey(storeSlug);
    return items;
  });
}

export async function clearCheckoutIdempotencyKey(
  storeSlug: string,
): Promise<void> {
  await serializeCheckoutKeyWrite(storeSlug, async () => {
    await AsyncStorage.removeItem(checkoutKeyStorageKey(storeSlug)).catch(
      () => undefined,
    );
  });
}

export async function getCheckoutIdempotencyKey(
  storeSlug: string,
  items: readonly CartItem[],
): Promise<string> {
  return serializeCheckoutKeyWrite(storeSlug, async () => {
    const key = checkoutKeyStorageKey(storeSlug);
    const fingerprint = cartFingerprint(items);
    const serialized = await AsyncStorage.getItem(key);
    if (serialized) {
      try {
        const existing = JSON.parse(serialized) as Partial<CheckoutKeyRecord>;
        if (
          existing.v === 1 &&
          existing.fingerprint === fingerprint &&
          typeof existing.id === "string" &&
          existing.done === undefined
        ) {
          return existing.id;
        }
      } catch {
        // Replace an invalid record with a fresh UUID below.
      }
    }

    const record: CheckoutKeyRecord = {
      v: 1,
      id: createUuidV4(),
      fingerprint,
    };
    await AsyncStorage.setItem(key, JSON.stringify(record));
    return record.id;
  });
}

interface CheckoutKeyRecord {
  v: 1;
  id: string;
  fingerprint: string;
  done?: true;
}

function cartFingerprint(items: readonly CartItem[]): string {
  return JSON.stringify(
    items.map(({ productId, variantId, quantity }) => ({
      productId,
      variantId: variantId ?? null,
      quantity,
    })),
  );
}

function createUuidV4(): string {
  const bytes = new Uint8Array(16);
  getRandomValues(bytes);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export async function markCheckoutIdempotencyKeyDone(
  storeSlug: string,
  items: readonly CartItem[],
  id: string,
): Promise<void> {
  await serializeCheckoutKeyWrite(storeSlug, async () => {
    const key = checkoutKeyStorageKey(storeSlug);
    const fingerprint = cartFingerprint(items);
    const serialized = await AsyncStorage.getItem(key);
    if (!serialized) return;

    let existing: Partial<CheckoutKeyRecord>;
    try {
      existing = JSON.parse(serialized) as Partial<CheckoutKeyRecord>;
    } catch {
      return;
    }
    if (
      existing.v !== 1 ||
      existing.id !== id ||
      existing.fingerprint !== fingerprint
    ) {
      return;
    }

    const record: CheckoutKeyRecord = { v: 1, id, fingerprint, done: true };
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await AsyncStorage.setItem(key, JSON.stringify(record));
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  });
}

async function serializeCheckoutKeyWrite<T>(
  storeSlug: string,
  action: () => Promise<T>,
): Promise<T> {
  const prior = pendingCheckoutKeyWrites.get(storeSlug) ?? Promise.resolve();
  const current = prior.catch(() => undefined).then(action);
  const tail = current.then(
    () => undefined,
    () => undefined,
  );
  pendingCheckoutKeyWrites.set(storeSlug, tail);
  try {
    return await current;
  } finally {
    if (pendingCheckoutKeyWrites.get(storeSlug) === tail) {
      pendingCheckoutKeyWrites.delete(storeSlug);
    }
  }
}
