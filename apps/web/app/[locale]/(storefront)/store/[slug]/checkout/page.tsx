"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { cartTotal, clearCart, getCart, type CartItem } from "@/lib/cart";

interface DeliveryMethod {
  type: "PICKUP" | "COURIER";
  enabled: boolean;
  details: Record<string, unknown>;
}

export default function CheckoutPage() {
  const { slug } = useParams<{ slug: string }>();
  const [items, setItems] = useState<CartItem[]>([]);
  const [deliveryMethods, setDeliveryMethods] = useState<DeliveryMethod[]>([]);
  const [deliveryMethodsLoaded, setDeliveryMethodsLoaded] = useState(false);
  const [deliveryMethodType, setDeliveryMethodType] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  useEffect(() => {
    setItems(getCart(slug));
    apiFetch(`/stores/${slug}/public/delivery-methods`)
      .then((methods: DeliveryMethod[]) => {
        setDeliveryMethods(methods);
        if (methods[0]) setDeliveryMethodType(methods[0].type);
      })
      .catch(() => setDeliveryMethods([]))
      .finally(() => setDeliveryMethodsLoaded(true));
  }, [slug]);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const { order, whatsappUrl } = await apiFetch(`/stores/${slug}/checkout`, {
        method: "POST",
        body: JSON.stringify({
          deliveryMethodType,
          customerName: customerName || undefined,
          customerPhone,
          customerEmail: customerEmail || undefined,
          items: items.map((item) => ({
            productId: item.productId,
            variantId: item.variantId,
            quantity: item.quantity,
          })),
        }),
      });

      clearCart(slug);
      setOrderId(order.id);

      if (whatsappUrl) {
        window.location.href = whatsappUrl;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  if (orderId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold text-gray-900">¡Pedido creado!</h1>
          <p className="mt-2 text-gray-500">
            Pedido #{orderId}. La tienda se pondrá en contacto para confirmar el pago.
          </p>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <p className="text-gray-500">
          Tu carrito está vacío.{" "}
          <a href={`/store/${slug}`} className="text-emerald-600 font-semibold">
            Volver a la tienda
          </a>
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="max-w-md mx-auto flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-gray-900">Confirmar pedido</h1>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-1">
          {items.map((item) => (
            <div
              key={`${item.productId}:${item.variantId ?? ""}`}
              className="flex justify-between text-sm text-gray-600"
            >
              <span>
                {item.quantity}x {item.name}
              </span>
              <span>${(item.price * item.quantity).toFixed(2)}</span>
            </div>
          ))}
          <div className="flex justify-between pt-2 mt-2 border-t border-gray-100 font-semibold text-gray-900">
            <span>Total</span>
            <span>${cartTotal(items).toFixed(2)}</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-3">
          {deliveryMethods.length > 0 && (
            <select
              value={deliveryMethodType}
              onChange={(e) => setDeliveryMethodType(e.target.value)}
              className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600"
            >
              {deliveryMethods.map((m) => (
                <option key={m.type} value={m.type}>
                  {m.type === "PICKUP" ? "Retiro en tienda" : "Envío por courier"}
                </option>
              ))}
            </select>
          )}

          <input
            placeholder="Nombre"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
          <input
            placeholder="Teléfono (WhatsApp)"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
          <input
            placeholder="Email (opcional)"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {deliveryMethodsLoaded && deliveryMethods.length === 0 && (
          <p className="text-sm text-amber-600">
            La tienda todavía no configuró un método de entrega — contactá al vendedor.
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={loading || !customerPhone || !deliveryMethodType}
          className="rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
        >
          {loading ? "Enviando..." : "Confirmar y continuar por WhatsApp"}
        </button>
      </div>
    </div>
  );
}
