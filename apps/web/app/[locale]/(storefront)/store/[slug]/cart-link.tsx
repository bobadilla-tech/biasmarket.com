"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { ShoppingCart } from "lucide-react";
import { CART_UPDATED_EVENT, getCart } from "@/lib/cart";
import { Link } from "@/i18n/navigation";

export function CartLink({ slug }: { slug: string }) {
  const t = useTranslations("storefront");
  const [count, setCount] = useState(0);

  useEffect(() => {
    const update = () => {
      const items = getCart(slug);
      setCount(items.reduce((sum, item) => sum + item.quantity, 0));
    };
    const onCartUpdated = (event: Event) => {
      if ((event as CustomEvent<{ slug?: string }>).detail?.slug === slug) {
        update();
      }
    };
    update();
    globalThis.addEventListener("focus", update);
    globalThis.addEventListener(CART_UPDATED_EVENT, onCartUpdated);
    return () => {
      globalThis.removeEventListener("focus", update);
      globalThis.removeEventListener(CART_UPDATED_EVENT, onCartUpdated);
    };
  }, [slug]);

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
    </Link>
  );
}
