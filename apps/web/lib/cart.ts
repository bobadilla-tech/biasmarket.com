export interface CartItem {
  productId: string;
  variantId?: string;
  name: string;
  price: number;
  quantity: number;
}

const cartKey = (slug: string) => `biasmarket:cart:${slug}`;

const itemKey = (item: Pick<CartItem, "productId" | "variantId">) =>
  `${item.productId}:${item.variantId ?? ""}`;

export function getCart(slug: string): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(cartKey(slug));
    return raw ? (JSON.parse(raw) as CartItem[]) : [];
  } catch {
    return [];
  }
}

function saveCart(slug: string, items: CartItem[]) {
  window.localStorage.setItem(cartKey(slug), JSON.stringify(items));
}

export function addToCart(slug: string, item: CartItem): CartItem[] {
  const items = getCart(slug);
  const existing = items.find((i) => itemKey(i) === itemKey(item));
  const next = existing
    ? items.map((i) =>
        itemKey(i) === itemKey(item) ? { ...i, quantity: i.quantity + item.quantity } : i,
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
      : items.map((i) => (itemKey(i) === itemKey(target) ? { ...i, quantity } : i));
  saveCart(slug, next);
  return next;
}

export function clearCart(slug: string) {
  saveCart(slug, []);
}

export function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}
