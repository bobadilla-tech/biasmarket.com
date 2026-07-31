"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { apiFetch } from "@/lib/api";

interface AccountOrder {
  id: string;
  paymentStatus: "PENDING_PAYMENT" | "PARTIALLY_PAID" | "PAYMENT_SUBMITTED" | "VERIFIED" | "REJECTED" | "CANCELLED";
  fulfillmentStatus: "ORDERING" | "IN_TRANSIT" | "READY" | "COMPLETED";
  totalAmount: string;
  currency: string;
  createdAt: string;
}

interface ConfirmResult {
  customer: { name: string | null; email: string | null; phone: string };
  orders: AccountOrder[];
}

function statusLabel(status: AccountOrder["paymentStatus"], t: ReturnType<typeof useTranslations>) {
  if (status === "REJECTED") return t("status.rejected");
  if (status === "CANCELLED") return t("status.cancelled");
  if (status === "PARTIALLY_PAID") return t("status.partial");
  if (status === "VERIFIED") return t("status.verified");
  
  return t("status.toConfirm");
}

export default function AccountConfirmPage() {
  const t = useTranslations("storefront.accountConfirmPage");
  const { slug } = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setError(t("errorTitle"));
      setLoading(false);
      return;
    }
    apiFetch(`/stores/${slug}/account/confirm?token=${encodeURIComponent(token)}`)
      .then((data: ConfirmResult) => setResult(data))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, [slug, token, t]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <p className="text-gray-500">{t("loading")}</p>
      </div>
    );
  }

  if (error || !result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-bold text-gray-900">{t("errorTitle")}</h1>
          <p className="mt-2 text-gray-500">{t("errorBody")}</p>
          <Link href={`/store/${slug}`} className="store-theme-link mt-4 inline-block font-semibold">
            {t("backToStore")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="max-w-md mx-auto flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <p className="mt-1 text-sm text-gray-500">{result.customer.email}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-gray-900">{t("ordersTitle")}</h2>
          {result.orders.length === 0 ? (
            <p className="text-sm text-gray-500">{t("noOrders")}</p>
          ) : (
            result.orders.map((order) => (
              <div
                key={order.id}
                className="flex justify-between items-center border-t border-gray-100 pt-3 first:border-t-0 first:pt-0"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">#{order.id.slice(0, 8)}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">
                    {order.currency} {order.totalAmount}
                  </p>
                  <p className="text-xs text-gray-500">{statusLabel(order.paymentStatus, t)}</p>
                </div>
              </div>
            ))
          )}
        </div>

        <Link href={`/store/${slug}`} className="store-theme-link text-center font-semibold">
          {t("backToStore")}
        </Link>
      </div>
    </div>
  );
}
