import {
  addCartItem,
  cartCount as countCartItems,
  cartTotal,
  hasMixedCurrencies,
  removeCartItem,
  updateCartItemQuantity,
  type CartItem,
  type CartItemIdentity,
} from "@biasmarket/utils/cart";

export type { CartItem } from "@biasmarket/utils/cart";
export { cartTotal, hasMixedCurrencies } from "@biasmarket/utils/cart";

export const CART_UPDATED_EVENT = "biasmarket:cart-updated";

const cartKey = (slug: string) => `biasmarket:cart:${slug}`;

export function getCart(slug: string): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = globalThis.localStorage.getItem(cartKey(slug));
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

function saveCart(slug: string, items: CartItem[]) {
  globalThis.localStorage.setItem(cartKey(slug), JSON.stringify(items));
  globalThis.dispatchEvent(
    new CustomEvent(CART_UPDATED_EVENT, { detail: { slug } }),
  );
}

export function addToCart(slug: string, item: CartItem): CartItem[] {
  const next = addCartItem(getCart(slug), item);
  saveCart(slug, next);
  return next;
}

export function updateQuantity(
  slug: string,
  target: CartItemIdentity,
  quantity: number,
): CartItem[] {
  const next = updateCartItemQuantity(getCart(slug), target, quantity);
  saveCart(slug, next);
  return next;
}

export function removeItem(
  slug: string,
  target: CartItemIdentity,
): CartItem[] {
  const next = removeCartItem(getCart(slug), target);
  saveCart(slug, next);
  return next;
}

export function clearCart(slug: string) {
  saveCart(slug, []);
}

export function cartCount(slug: string): number {
  return countCartItems(getCart(slug));
}
