"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select } from "@/components/ui/select";
import { Link } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";
import { cartTotal, clearCart, getCart, hasMixedCurrencies, type CartItem } from "@/lib/cart";

interface DeliveryMethod {
  type: "PICKUP" | "COURIER";
  enabled: boolean;
  details: Record<string, unknown>;
}

interface PickupPoint {
  id: string;
  label: string;
  enabled: boolean;
}

export default function CheckoutPage() {
  const t = useTranslations("storefront.checkoutPage");
  const { slug } = useParams<{ slug: string }>();
  const [items, setItems] = useState<CartItem[]>([]);
  const [deliveryMethods, setDeliveryMethods] = useState<DeliveryMethod[]>([]);
  const [deliveryMethodsLoaded, setDeliveryMethodsLoaded] = useState(false);
  const [deliveryMethodType, setDeliveryMethodType] = useState<string>("");
  const [pickupPoints, setPickupPoints] = useState<PickupPoint[]>([]);
  const [pickupPointId, setPickupPointId] = useState<string>("");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [orderId, setOrderId] = useState<string | null>(null);

  const mixedCurrencies = hasMixedCurrencies(items);

  useEffect(() => {
    setItems(getCart(slug));
    apiFetch(`/stores/${slug}/public/delivery-methods`)
      .then((methods: DeliveryMethod[]) => {
        setDeliveryMethods(methods);
        if (methods[0]) setDeliveryMethodType(methods[0].type);
      })
      .catch(() => setDeliveryMethods([]))
      .finally(() => setDeliveryMethodsLoaded(true));
    apiFetch(`/stores/${slug}/public/pickup-points`)
      .then((points: PickupPoint[]) => {
        setPickupPoints(points);
        if (points[0]) setPickupPointId(points[0].id);
      })
      .catch(() => setPickupPoints([]));
  }, [slug]);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const { order, whatsappUrl } = await apiFetch(`/stores/${slug}/checkout`, {
        method: "POST",
        body: JSON.stringify({
          deliveryMethodType,
          pickupPointId:
            deliveryMethodType === "PICKUP" && pickupPointId ? pickupPointId : undefined,
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
          <h1 className="text-xl font-bold text-gray-900">{t("orderCreatedTitle")}</h1>
          <p className="mt-2 text-gray-500">{t("orderCreatedBody", { orderId })}</p>
          {customerEmail && <p className="mt-2 text-gray-500">{t("checkEmailNotice")}</p>}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <p className="text-gray-500">
          {t("emptyCart")}{" "}
          <Link href={`/store/${slug}`} className="store-theme-link font-semibold">
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

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-1">
          {items.map((item) => (
            <div
              key={`${item.productId}:${item.variantId ?? ""}`}
              className="flex justify-between text-sm text-gray-600"
            >
              <span>
                {item.quantity}x {item.name}
              </span>
              <span>
                {(item.price * item.quantity).toFixed(2)} {item.currency}
              </span>
            </div>
          ))}
          <div className="flex justify-between pt-2 mt-2 border-t border-gray-100 font-semibold text-gray-900">
            <span>{t("total")}</span>
            <span>
              {cartTotal(items).toFixed(2)} {items[0].currency}
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-3">
          {deliveryMethods.length > 0 && (
            <Select
              value={deliveryMethodType}
              onChange={(e) => setDeliveryMethodType(e.target.value)}
              selectClassName="rounded-xl border border-gray-200 py-2.5 text-sm text-gray-600"
            >
              {deliveryMethods.map((m) => (
                <option key={m.type} value={m.type}>
                  {m.type === "PICKUP" ? t("deliveryPickup") : t("deliveryCourier")}
                </option>
              ))}
            </Select>
          )}

          {deliveryMethodType === "PICKUP" && pickupPoints.length > 0 && (
            <Select
              value={pickupPointId}
              onChange={(e) => setPickupPointId(e.target.value)}
              selectClassName="rounded-xl border border-gray-200 py-2.5 text-sm text-gray-600"
            >
              {pickupPoints.map((point) => (
                <option key={point.id} value={point.id}>
                  {point.label}
                </option>
              ))}
            </Select>
          )}

          <input
            placeholder={t("namePlaceholder")}
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            className="store-theme-input rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none"
          />
          <PhoneInput
            value={customerPhone}
            onChange={setCustomerPhone}
            placeholder={t("phonePlaceholder")}
            selectClassName="store-theme-input rounded-xl border border-gray-200 py-2.5 text-sm text-gray-600 outline-none"
            inputClassName="store-theme-input rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none"
          />
          <input
            placeholder={t("emailPlaceholder")}
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            className="store-theme-input rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none"
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {deliveryMethodsLoaded && deliveryMethods.length === 0 && (
          <p className="text-sm text-amber-600">{t("noDeliveryMethod")}</p>
        )}

        {mixedCurrencies && (
          <p className="text-sm text-amber-600">{t("mixedCurrencyWarning")}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={
            loading ||
            !customerPhone ||
            !deliveryMethodType ||
            mixedCurrencies ||
            (deliveryMethodType === "PICKUP" && pickupPoints.length > 0 && !pickupPointId)
          }
          className="store-theme-primary-button rounded-xl px-5 py-3 text-sm font-semibold transition disabled:opacity-60"
        >
          {loading ? t("submitting") : t("submit")}
        </button>
      </div>
    </div>
  );
}
