"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { type CartItem, getCart } from "@/lib/cart";
import { CheckoutForm, CheckoutSummary } from "@/features/checkout";

export function CheckoutPageClient() {
  const t = useTranslations("storefront.checkoutPage");
  const { slug } = useParams<{ slug: string }>();
  const [items, setItems] = useState<CartItem[]>([]);
  const [order, setOrder] = useState<
    { orderId: string; customerEmail: string } | null
  >(null);

  useEffect(() => {
    setItems(getCart(slug));
  }, [slug]);

  if (order) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold text-gray-900">
            {t("orderCreatedTitle")}
          </h1>
          <p className="mt-2 text-gray-500">
            {t("orderCreatedBody", { orderId: order.orderId })}
          </p>
          {order.customerEmail && (
            <p className="mt-2 text-gray-500">{t("checkEmailNotice")}</p>
          )}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <p className="text-gray-500">
          {t("emptyCart")}{" "}
          <Link
            href={`/store/${slug}`}
            className="store-theme-link font-semibold"
          >
            {t("backToStore")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="max-w-md mx-auto flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <CheckoutSummary items={items} />
        <CheckoutForm slug={slug} items={items} onOrderCreated={setOrder} />
      </div>
    </div>
  );
}
