"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { getCart } from "@/lib/cart";
import { Link } from "@/i18n/navigation";

export function CartLink({ slug }: { slug: string }) {
  const t = useTranslations("storefront");
  const [count, setCount] = useState(0);

  useEffect(() => {
    const update = () => {
      const items = getCart(slug);
      setCount(items.reduce((sum, item) => sum + item.quantity, 0));
    };
    update();
    window.addEventListener("focus", update);
    return () => window.removeEventListener("focus", update);
  }, [slug]);

  return (
    <Link
      href={`/store/${slug}/cart`}
      className="store-theme-primary-button fixed bottom-6 right-6 rounded-full px-5 py-3 text-sm font-semibold shadow-lg transition"
    >
      {t("cart")} {count > 0 ? `(${count})` : ""}
    </Link>
  );
}
