"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import { ShoppingCart } from "lucide-react";
import { CART_UPDATED_EVENT, cartCount } from "@/lib/cart";
import { Link } from "@/i18n/navigation";

export function CartLink({ slug }: { slug: string }) {
  const t = useTranslations("storefront");

  // useSyncExternalStore (not a post-mount effect): CartLink lives in the
  // persistent (storefront) layout, so a lazy-init effect only ever showed
  // the "0 -> N" badge pop on a hard load / new tab. The server snapshot is
  // 0 (no window) and the client snapshot is the real count, computed
  // synchronously on the first client render — no flash, no hydration
  // mismatch. `subscribe` is keyed on `slug` so React does not re-subscribe
  // on every render.
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const onCartUpdated = (event: Event) => {
        if ((event as CustomEvent<{ slug?: string }>).detail?.slug === slug) {
          onStoreChange();
        }
      };
      globalThis.addEventListener("focus", onStoreChange);
      globalThis.addEventListener(CART_UPDATED_EVENT, onCartUpdated);
      return () => {
        globalThis.removeEventListener("focus", onStoreChange);
        globalThis.removeEventListener(CART_UPDATED_EVENT, onCartUpdated);
      };
    },
    [slug],
  );

  const count = useSyncExternalStore(
    subscribe,
    () => cartCount(slug),
    () => 0,
  );

  return (
    <Link
      href={`/store/${slug}/cart`}
      aria-label={t("cart")}
      className="relative flex size-9 items-center justify-center rounded-full border border-gray-100 bg-white text-gray-700 shadow-sm transition hover:bg-gray-50"
    >
      <ShoppingCart className="size-4" />
      {count > 0 && (
        <span
          key={count}
          className="cart-badge-pulse absolute -top-1 -right-1 flex min-w-4 items-center justify-center rounded-full bg-[var(--store-primary)] px-1 text-[10px] leading-4 font-bold text-white"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
      <span className="sr-only" role="status" aria-live="polite">
        {t("cartCount", { count })}
      </span>
    </Link>
  );
}
