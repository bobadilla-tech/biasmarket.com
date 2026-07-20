"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { cartTotal, getCart, updateQuantity, type CartItem } from "@/lib/cart";

export default function CartPage() {
  const { slug } = useParams<{ slug: string }>();
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    setItems(getCart(slug));
  }, [slug]);

  const handleQuantityChange = (item: CartItem, quantity: number) => {
    const next = updateQuantity(slug, item, quantity);
    setItems(next);
  };

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-gray-900">Tu carrito</h1>

        {items.length === 0 ? (
          <p className="text-gray-500">
            Tu carrito está vacío.{" "}
            <a href={`/store/${slug}`} className="text-emerald-600 font-semibold">
              Seguir viendo productos
            </a>
          </p>
        ) : (
          <>
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 divide-y divide-gray-100">
              {items.map((item) => (
                <div
                  key={`${item.productId}:${item.variantId ?? ""}`}
                  className="flex items-center justify-between gap-3 px-6 py-4"
                >
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{item.name}</p>
                    <p className="text-emerald-600 text-sm">${item.price}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleQuantityChange(item, item.quantity - 1)}
                      className="size-7 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                    >
                      -
                    </button>
                    <span className="w-6 text-center text-sm text-gray-900">{item.quantity}</span>
                    <button
                      onClick={() => handleQuantityChange(item, item.quantity + 1)}
                      className="size-7 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex items-center justify-between">
              <span className="font-semibold text-gray-900">Total</span>
              <span className="font-bold text-emerald-600 text-lg">
                ${cartTotal(items).toFixed(2)}
              </span>
            </div>

            <a
              href={`/store/${slug}/checkout`}
              className="rounded-xl bg-emerald-500 px-5 py-3 text-center text-sm font-semibold text-white transition hover:bg-emerald-600"
            >
              Ir a pagar
            </a>
          </>
        )}
      </div>
    </div>
  );
}
