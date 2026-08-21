export interface CartItem {
  productId: string;
  variantId?: string;
  name: string;
  variantLabel?: string;
  image?: string;
  price: number;
  currency: string;
  quantity: number;
}

// Fired on window after every cart mutation so mounted UI (e.g. the header
// CartLink badge) can re-read localStorage without waiting for a remount or
// a window focus.
export const CART_UPDATED_EVENT = "biasmarket:cart-updated";

const cartKey = (slug: string) => `biasmarket:cart:${slug}`;

const itemKey = (item: Pick<CartItem, "productId" | "variantId">) =>
  `${item.productId}:${item.variantId ?? ""}`;

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
  const items = getCart(slug);
  const existing = items.find((i) => itemKey(i) === itemKey(item));
  const next = existing
    ? items.map((i) =>
        itemKey(i) === itemKey(item)
          ? { ...i, quantity: i.quantity + item.quantity }
          : i,
      )
    : [...items, item];
  saveCart(slug, next);
  return next;
}

export function updateQuantity(
  slug: string,
  target: Pick<CartItem, "productId" | "variantId">,
  quantity: number,
): CartItem[] {
  const items = getCart(slug);
  const next =
    quantity <= 0
      ? items.filter((i) => itemKey(i) !== itemKey(target))
      : items.map((i) =>
          itemKey(i) === itemKey(target) ? { ...i, quantity } : i,
        );
  saveCart(slug, next);
  return next;
}

export function removeItem(
  slug: string,
  target: Pick<CartItem, "productId" | "variantId">,
): CartItem[] {
  const next = getCart(slug).filter((i) => itemKey(i) !== itemKey(target));
  saveCart(slug, next);
  return next;
}

export function clearCart(slug: string) {
  saveCart(slug, []);
}

export function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

// Returns the shared currency across all cart items, or null when the cart
// is empty or mixes currencies (checkout can't sum different currencies into
// one total, so callers should block submission and warn in that case).
export function cartCurrency(items: CartItem[]): string | null {
  if (items.length === 0) return null;
  const currencies = new Set(items.map((item) => item.currency));
  return currencies.size === 1 ? items[0].currency : null;
}

export function hasMixedCurrencies(items: CartItem[]): boolean {
  return new Set(items.map((item) => item.currency)).size > 1;
}
