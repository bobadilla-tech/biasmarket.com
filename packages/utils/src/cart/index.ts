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

export type CartItemIdentity = Pick<CartItem, "productId" | "variantId">;

export function cartItemKey(item: CartItemIdentity): string {
  return `${item.productId}:${item.variantId ?? ""}`;
}

export function addCartItem(items: CartItem[], item: CartItem): CartItem[] {
  const existingKey = cartItemKey(item);
  const existing = items.find((current) => cartItemKey(current) === existingKey);
  return existing
    ? items.map((current) =>
        cartItemKey(current) === existingKey
          ? { ...current, quantity: current.quantity + item.quantity }
          : current,
      )
    : [...items, item];
}

export function updateCartItemQuantity(
  items: CartItem[],
  target: CartItemIdentity,
  quantity: number,
): CartItem[] {
  const targetKey = cartItemKey(target);
  return quantity <= 0
    ? items.filter((item) => cartItemKey(item) !== targetKey)
    : items.map((item) =>
        cartItemKey(item) === targetKey ? { ...item, quantity } : item,
      );
}

export function removeCartItem(
  items: CartItem[],
  target: CartItemIdentity,
): CartItem[] {
  const targetKey = cartItemKey(target);
  return items.filter((item) => cartItemKey(item) !== targetKey);
}

export function cartTotal(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

export function cartCount(items: CartItem[]): number {
  return items.reduce((sum, item) => sum + item.quantity, 0);
}

export function cartCurrency(items: CartItem[]): string | null {
  if (items.length === 0) return null;
  const currencies = new Set(items.map((item) => item.currency));
  return currencies.size === 1 ? items[0].currency : null;
}

export function hasMixedCurrencies(items: CartItem[]): boolean {
  return new Set(items.map((item) => item.currency)).size > 1;
}
