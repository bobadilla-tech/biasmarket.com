"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/use-store";

interface OrderItemRow {
  id: string;
  quantity: number;
  product: { id: string; name: string };
  variant: { id: string; name: string } | null;
}

interface Order {
  id: string;
  customerName: string | null;
  customerPhone: string;
  totalAmount: string;
  currency: string;
  paymentStatus: "PENDING_PAYMENT" | "PAYMENT_SUBMITTED" | "VERIFIED" | "REJECTED" | "CANCELLED";
  fulfillmentStatus: "ORDERING" | "IN_TRANSIT" | "READY" | "COMPLETED";
  deliveryMethodType: "PICKUP" | "COURIER";
  deliveryDetails: Record<string, unknown> | null;
  createdAt: string;
  items: OrderItemRow[];
}

const NEXT_FULFILLMENT: Record<string, string | undefined> = {
  ORDERING: "IN_TRANSIT",
  IN_TRANSIT: "READY",
  READY: "COMPLETED",
  COMPLETED: undefined,
};

type OrdersTab = "all" | "pending" | "transit" | "delivered";

function getOrderNumber(orderId: string) {
  return `#${orderId.slice(-4).toUpperCase()}`;
}

function getInitials(name: string | null, phone: string) {
  const source = (name ?? "").trim();
  if (source) {
    const parts = source.split(/\s+/).filter(Boolean);
    const initialA = parts[0]?.slice(0, 1) ?? "";
    const initialB = parts[1]?.slice(0, 1) ?? "";
    return `${initialA}${initialB}`.toUpperCase() || source.slice(0, 2).toUpperCase();
  }
  return phone.slice(-2).toUpperCase();
}

function formatOrderDate(createdAt: string, locale: string, t: any) {
  const date = new Date(createdAt);
  const now = new Date();
  const time = new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(date);

  const isToday = now.toDateString() === date.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = yesterday.toDateString() === date.toDateString();

  if (isToday) return t("date.today", { time });
  if (isYesterday) return t("date.yesterday", { time });

  const day = new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" }).format(date);
  return `${day} ${time}`;
}

function getDeliveryLabel(order: Order, t: any) {
  const details = order.deliveryDetails ?? {};
  if (order.deliveryMethodType === "PICKUP") {
    const address = typeof details.address === "string" ? details.address.trim() : "";
    return address ? `${t("delivery.pickup")} - ${address}` : t("delivery.pickup");
  }

  const costRaw = details.estimatedCost;
  const cost =
    typeof costRaw === "number"
      ? costRaw
      : typeof costRaw === "string"
        ? Number(costRaw)
        : undefined;
  if (typeof cost === "number" && Number.isFinite(cost) && cost > 0) {
    return `${t("delivery.courier")} - ${t("delivery.estimatedCost", { cost })}`;
  }
  return t("delivery.courier");
}

function getProductSummary(order: Order, t: any) {
  const first = order.items?.[0];
  if (!first) return t("unknownProduct");
  const base = first.variant?.name ? `${first.product.name} (${first.variant.name})` : first.product.name;
  const moreCount = (order.items?.length ?? 0) - 1;
  if (moreCount > 0) return t("productSummaryMore", { product: base, count: moreCount });
  return base;
}

function getOrderStatus(order: Order, t: any) {
  if (order.paymentStatus === "REJECTED") {
    return { label: t("status.rejected"), className: "bg-red-50 text-red-700" };
  }
  if (order.paymentStatus === "CANCELLED") {
    return { label: t("status.cancelled"), className: "bg-slate-100 text-slate-700" };
  }
  if (order.paymentStatus !== "VERIFIED") {
    return { label: t("status.toConfirm"), className: "bg-violet-50 text-violet-700" };
  }
  if (order.fulfillmentStatus === "COMPLETED") {
    return { label: t("status.delivered"), className: "bg-emerald-50 text-emerald-700" };
  }
  if (order.fulfillmentStatus === "IN_TRANSIT" || order.fulfillmentStatus === "READY") {
    return { label: t("status.inTransit"), className: "bg-pink-50 text-pink-700" };
  }
  return { label: t("status.pending"), className: "bg-amber-50 text-amber-700" };
}

function matchesTab(order: Order, tab: OrdersTab) {
  if (tab === "all") return true;
  if (tab === "delivered") return order.paymentStatus === "VERIFIED" && order.fulfillmentStatus === "COMPLETED";
  if (tab === "transit") {
    return (
      order.paymentStatus === "VERIFIED" &&
      (order.fulfillmentStatus === "IN_TRANSIT" || order.fulfillmentStatus === "READY")
    );
  }
  return (
    order.paymentStatus !== "VERIFIED" ||
    (order.paymentStatus === "VERIFIED" && order.fulfillmentStatus === "ORDERING")
  );
}

export default function OrdersPage() {
  const t = useTranslations("dashboard.orders");
  const tCommon = useTranslations("common");
  const { locale } = useParams<{ locale: string }>();
  const { storeId, loading: storeLoading } = useStore();
  const [orders, setOrders] = useState<Order[]>([]);
  const [activeTab, setActiveTab] = useState<OrdersTab>("all");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
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

  const filteredOrders = useMemo(
    () => orders.filter((order) => matchesTab(order, activeTab)),
    [activeTab, orders],
  );

  const counts = useMemo(
    () => ({
      all: orders.length,
      pending: orders.filter((order) => matchesTab(order, "pending")).length,
      transit: orders.filter((order) => matchesTab(order, "transit")).length,
      delivered: orders.filter((order) => matchesTab(order, "delivered")).length,
    }),
    [orders],
  );

  const selectedOrder = useMemo(
    () => (selectedOrderId ? orders.find((order) => order.id === selectedOrderId) ?? null : null),
    [orders, selectedOrderId],
  );

  if (storeLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-sm text-[#8f7da8]">
        {tCommon("loading")}
      </div>
    );
  }

  return (
    <div className="min-h-screen px-5 py-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-[#8e7ca7]">{t("subtitle")}</p>
            <h1 className="text-3xl font-bold tracking-tight text-[#2d1649]">
              {t("titleWithCount", { count: orders.length })}
            </h1>
          </div>
          <Button
            type="button"
            onClick={() => alert(t("newOrderSoon"))}
            className="store-theme-primary-button h-11 rounded-2xl px-5 text-sm font-semibold hover:opacity-100"
          >
            <Plus className="size-4" />
            {t("newOrder")}
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 rounded-2xl border border-[#eadcf7] bg-white p-1">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setActiveTab("all")}
              className={cn(
                "h-9 rounded-2xl px-4 text-sm font-semibold",
                activeTab === "all"
                  ? "store-theme-primary-button"
                  : "text-[#8f7da8] hover:bg-[#fcf9ff] hover:text-[#2d1649]",
              )}
            >
              {t("tabs.all")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setActiveTab("pending")}
              className={cn(
                "h-9 rounded-2xl px-4 text-sm font-semibold",
                activeTab === "pending"
                  ? "store-theme-primary-button"
                  : "text-[#8f7da8] hover:bg-[#fcf9ff] hover:text-[#2d1649]",
              )}
            >
              {t("tabs.pending")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setActiveTab("transit")}
              className={cn(
                "h-9 rounded-2xl px-4 text-sm font-semibold",
                activeTab === "transit"
                  ? "store-theme-primary-button"
                  : "text-[#8f7da8] hover:bg-[#fcf9ff] hover:text-[#2d1649]",
              )}
            >
              {t("tabs.transit")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setActiveTab("delivered")}
              className={cn(
                "h-9 rounded-2xl px-4 text-sm font-semibold",
                activeTab === "delivered"
                  ? "store-theme-primary-button"
                  : "text-[#8f7da8] hover:bg-[#fcf9ff] hover:text-[#2d1649]",
              )}
            >
              {t("tabs.delivered")}
            </Button>
          </div>
          <p className="text-sm text-[#8f7da8]">
            {t("showingCount", { count: filteredOrders.length, total: counts[activeTab] })}
          </p>
        </div>

        {error ? (
          <Card className="rounded-2xl border-[#f3cbd8] bg-[#fff3f7] py-0 shadow-none">
            <CardContent className="px-4 py-3 text-sm text-[#b24368]">{error}</CardContent>
          </Card>
        ) : null}

        <Card className="overflow-hidden rounded-[30px] border-[#eadcf8] bg-white py-0 shadow-sm">
          <CardContent className="px-0">
            {filteredOrders.length === 0 ? (
              <div className="px-6 py-10 text-sm text-[#8f7da8]">{t("empty")}</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#f3ebff] bg-[#fcf9ff] text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-[#927fac]">
                    <th className="px-6 py-4">{t("columns.number")}</th>
                    <th className="px-6 py-4">{t("columns.customer")}</th>
                    <th className="px-6 py-4">{t("columns.product")}</th>
                    <th className="px-6 py-4">{t("columns.total")}</th>
                    <th className="px-6 py-4">{t("columns.delivery")}</th>
                    <th className="px-6 py-4">{t("columns.date")}</th>
                    <th className="px-6 py-4">{t("columns.status")}</th>
                    <th className="px-6 py-4 text-right">{t("columns.actions")}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => {
                    const number = getOrderNumber(order.id);
                    const initials = getInitials(order.customerName, order.customerPhone);
                    const customer = order.customerName ?? order.customerPhone;
                    const product = getProductSummary(order, t);
                    const delivery = getDeliveryLabel(order, t);
                    const date = formatOrderDate(order.createdAt, locale, t);
                    const status = getOrderStatus(order, t);
                    return (
                      <tr
                        key={order.id}
                        className="border-b border-[#f3ebff] last:border-0 hover:bg-[#fcf9ff]"
                      >
                        <td className="px-6 py-4 text-xs font-semibold text-[#8f7da8]">{number}</td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className="flex size-9 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                              style={{
                                background:
                                  "linear-gradient(135deg, var(--store-accent) 0%, var(--store-primary) 100%)",
                              }}
                            >
                              {initials}
                            </div>
                            <p className="text-sm font-semibold text-[#2d1649]">{customer}</p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-[#2d1649]">{product}</td>
                        <td className="px-6 py-4 text-sm font-semibold text-[var(--store-accent)]">
                          {order.currency} {order.totalAmount}
                        </td>
                        <td className="px-6 py-4 text-sm text-[#8f7da8]">{delivery}</td>
                        <td className="px-6 py-4 text-sm text-[#8f7da8]">{date}</td>
                        <td className="px-6 py-4">
                          <Badge className={cn("rounded-full px-3 py-1 text-xs font-semibold", status.className)}>
                            {status.label}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => {
                              setSelectedOrderId(order.id);
                              setDetailsOpen(true);
                            }}
                            className="h-8 rounded-full border-[#eadcf7] bg-white px-4 text-xs font-semibold text-[#2d1649] shadow-none hover:bg-[#fcf9ff]"
                          >
                            {t("view")}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        <Sheet
          open={detailsOpen}
          onOpenChange={(open) => {
            setDetailsOpen(open);
            if (!open) setSelectedOrderId(null);
          }}
        >
          <SheetContent className="h-dvh w-[420px] gap-0 overflow-y-auto sm:max-w-[420px]">
            {selectedOrder ? (
              <>
                <SheetHeader>
                  <SheetTitle>{t("details.title", { number: getOrderNumber(selectedOrder.id) })}</SheetTitle>
                  <SheetDescription>
                    {selectedOrder.customerName ?? selectedOrder.customerPhone}
                  </SheetDescription>
                </SheetHeader>

                <div className="space-y-6 px-4 pb-24 pt-4">
                  <div className="space-y-2 rounded-2xl border border-[#f0e7f8] bg-[#fcf9ff] p-4">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#8f7da8]">{t("details.total")}</span>
                      <span className="font-semibold text-[#2d1649]">
                        {selectedOrder.currency} {selectedOrder.totalAmount}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#8f7da8]">{t("details.delivery")}</span>
                      <span className="font-medium text-[#2d1649]">{getDeliveryLabel(selectedOrder, t)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-[#8f7da8]">{t("details.date")}</span>
                      <span className="font-medium text-[#2d1649]">
                        {formatOrderDate(selectedOrder.createdAt, locale, t)}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#927fac]">
                      {t("details.items")}
                    </p>
                    <div className="space-y-2">
                      {selectedOrder.items.map((item) => (
                        <div
                          key={item.id}
                          className="flex items-start justify-between rounded-2xl border border-[#f0e7f8] bg-white px-4 py-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#2d1649]">
                              {item.product.name}
                              {item.variant?.name ? ` (${item.variant.name})` : ""}
                            </p>
                            <p className="text-xs text-[#8f7da8]">{t("details.quantity", { count: item.quantity })}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <SheetFooter className="sticky bottom-0 border-t border-[#f0e7f8] bg-white px-4 py-4">
                  <div className="flex w-full flex-wrap gap-2">
                    {(selectedOrder.paymentStatus === "PENDING_PAYMENT" ||
                      selectedOrder.paymentStatus === "PAYMENT_SUBMITTED") && (
                      <>
                        <Button
                          type="button"
                          onClick={async () => {
                            await handleReview(selectedOrder.id, "approve");
                            setDetailsOpen(false);
                          }}
                          className="store-theme-primary-button h-11 flex-1 rounded-2xl text-sm font-semibold hover:opacity-100"
                        >
                          {t("approve")}
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          onClick={async () => {
                            await handleReview(selectedOrder.id, "reject");
                            setDetailsOpen(false);
                          }}
                          className="h-11 flex-1 rounded-2xl border-[#eadcf7] bg-white text-sm font-semibold text-[#2d1649] shadow-none hover:bg-[#fcf9ff]"
                        >
                          {t("reject")}
                        </Button>
                      </>
                    )}
                    {selectedOrder.paymentStatus === "VERIFIED" &&
                    NEXT_FULFILLMENT[selectedOrder.fulfillmentStatus] ? (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={async () => {
                          const next = NEXT_FULFILLMENT[selectedOrder.fulfillmentStatus];
                          if (!next) return;
                          await handleAdvance(selectedOrder.id, next);
                          setDetailsOpen(false);
                        }}
                        className="h-11 flex-1 rounded-2xl border-[#eadcf7] bg-white text-sm font-semibold text-[#2d1649] shadow-none hover:bg-[#fcf9ff]"
                      >
                        {(() => {
                          const next = NEXT_FULFILLMENT[selectedOrder.fulfillmentStatus];
                          return next ? t("markAs", { status: next }) : null;
                        })()}
                      </Button>
                    ) : null}
                  </div>
                </SheetFooter>
              </>
            ) : null}
          </SheetContent>
        </Sheet>
      </div>
    </div>
  );
}
