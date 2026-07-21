"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { apiFetch } from "@/lib/api";
import { useStore } from "@/lib/use-store";

interface Order {
  id: string;
  customerName: string | null;
  customerPhone: string;
  totalAmount: string;
  currency: string;
  paymentStatus: "PENDING_PAYMENT" | "PAYMENT_SUBMITTED" | "VERIFIED" | "REJECTED" | "CANCELLED";
  fulfillmentStatus: "ORDERING" | "IN_TRANSIT" | "READY" | "COMPLETED";
  createdAt: string;
}

const NEXT_FULFILLMENT: Record<string, string | undefined> = {
  ORDERING: "IN_TRANSIT",
  IN_TRANSIT: "READY",
  READY: "COMPLETED",
  COMPLETED: undefined,
};

export default function OrdersPage() {
  const t = useTranslations("dashboard.orders");
  const tCommon = useTranslations("common");
  const { storeId, loading: storeLoading } = useStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [error, setError] = useState<string | null>(null);

  const loadOrders = async () => {
    if (!storeId) return;
    try {
      const data = await apiFetch(`/stores/${storeId}/orders`);
      setOrders(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const handleReview = async (orderId: string, decision: "approve" | "reject") => {
    try {
      await apiFetch(`/stores/${storeId}/orders/${orderId}/review`, {
        method: "PATCH",
        body: JSON.stringify({ decision }),
      });
      await loadOrders();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleAdvance = async (orderId: string, status: string) => {
    try {
      await apiFetch(`/stores/${storeId}/orders/${orderId}/fulfillment`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      await loadOrders();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  if (storeLoading) {
    return (
      <div className="min-h-screen bg-gray-50 px-6 py-10 text-sm text-gray-500">
        {tCommon("loading")}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="max-w-5xl mx-auto flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                <th className="px-6 py-3 font-medium">{t("columns.customer")}</th>
                <th className="px-6 py-3 font-medium">{t("columns.total")}</th>
                <th className="px-6 py-3 font-medium">{t("columns.payment")}</th>
                <th className="px-6 py-3 font-medium">{t("columns.delivery")}</th>
                <th className="px-6 py-3 font-medium">{t("columns.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => {
                const nextFulfillment = NEXT_FULFILLMENT[order.fulfillmentStatus];
                const canReview =
                  order.paymentStatus === "PENDING_PAYMENT" ||
                  order.paymentStatus === "PAYMENT_SUBMITTED";
                return (
                  <tr key={order.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-6 py-3 text-gray-900">
                      {order.customerName ?? order.customerPhone}
                    </td>
                    <td className="px-6 py-3 text-gray-900">
                      {order.totalAmount} {order.currency}
                    </td>
                    <td className="px-6 py-3">
                      <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                        {order.paymentStatus}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600">
                        {order.fulfillmentStatus}
                      </span>
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex gap-2">
                        {canReview && (
                          <>
                            <button
                              onClick={() => handleReview(order.id, "approve")}
                              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-600"
                            >
                              {t("approve")}
                            </button>
                            <button
                              onClick={() => handleReview(order.id, "reject")}
                              className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
                            >
                              {t("reject")}
                            </button>
                          </>
                        )}
                        {order.paymentStatus === "VERIFIED" && nextFulfillment && (
                          <button
                            onClick={() => handleAdvance(order.id, nextFulfillment)}
                            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
                          >
                            {t("markAs", { status: nextFulfillment })}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
