"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, Receipt, Wallet, Upload, X, ImageIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
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

interface OrderItemRow {Upload: any
  id: string;
  quantity: number;
  product: { id: string; name: string; images?: string[] };
  variant: { id: string; name: string } | null;
}

interface OrderPaymentRow {
  id: string;
  amount: string;
  method?: string | null;
  note?: string | null;
  imageUrl?: string | null;
  createdAt: string;
}

interface Order {
  id: string;
  customerName: string | null;
  customerPhone: string;
  totalAmount: string;
  requiredAmount: string;
  paidAmount: number;
  pendingAmount: number;
  paidPercentage: number;
  currency: string;
  paymentStatus: "PENDING_PAYMENT" | "PARTIALLY_PAID" | "PAYMENT_SUBMITTED" | "VERIFIED" | "REJECTED" | "CANCELLED";
  fulfillmentStatus: "ORDERING" | "IN_TRANSIT" | "READY" | "COMPLETED";
  deliveryMethodType: "PICKUP" | "COURIER";
  deliveryDetails: Record<string, unknown> | null;
  createdAt: string;
  items: OrderItemRow[];
  payments: OrderPaymentRow[];
}

const NEXT_FULFILLMENT: Record<string, string | undefined> = {
  ORDERING: "IN_TRANSIT",
  IN_TRANSIT: "READY",
  READY: "COMPLETED",
  COMPLETED: undefined,
};

// Sensitive = hard to revert / strong customer impact -> confirm modal.
// Everything else = frequent, low-risk -> optimistic change + undo toast.
const SENSITIVE_FULFILLMENT = new Set(["COMPLETED"]);
const UNDO_WINDOW_MS = 8000;

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
  if (order.paymentStatus === "PARTIALLY_PAID") {
    return { label: t("status.partial"), className: "border border-sky-200 bg-gradient-to-r from-sky-50 to-blue-50 text-sky-800 shadow-sm" };
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
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("");
  const [enabledPaymentMethods, setEnabledPaymentMethods] = useState<string[]>([]);
  const [paymentNote, setPaymentNote] = useState("");
  const [paymentImage, setPaymentImage] = useState<File | null>(null);
  const [paymentSubmitting, setPaymentSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [paymentPreviewUrl, setPaymentPreviewUrl] = useState<string | null>(null);
  const [pendingChange, setPendingChange] = useState<
    Record<string, { field: "paymentStatus" | "fulfillmentStatus"; previousValue: string }>
  >({});
  const [confirmTarget, setConfirmTarget] = useState<{
    orderId: string;
    kind: "review" | "advance";
    decision?: "approve" | "reject";
    nextStatus?: string;
    label: string;
  } | null>(null);

  const fulfillmentLabels: Record<string, string> = {
    ORDERING: t("fulfillmentLabels.ORDERING"),
    IN_TRANSIT: t("fulfillmentLabels.IN_TRANSIT"),
    READY: t("fulfillmentLabels.READY"),
    COMPLETED: t("fulfillmentLabels.COMPLETED"),
  };
  const paymentActionLabels: Record<"approve" | "reject", string> = {
    approve: t("paymentActionLabels.approve"),
    reject: t("paymentActionLabels.reject"),
  };
  const paymentMethodLabels: Record<string, string> = {
    YAPE: t("paymentMethodLabels.YAPE"),
    PLIN: t("paymentMethodLabels.PLIN"),
    TRANSFER: t("paymentMethodLabels.TRANSFER"),
    CASH: t("paymentMethodLabels.CASH"),
  };

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

  useEffect(() => {
    if (!storeId) return;
    apiFetch(`/stores/${storeId}/payment-methods?enabled=1`)
      .then((methods: { method: string }[]) => setEnabledPaymentMethods(methods.map((m) => m.method)))
      .catch(() => setEnabledPaymentMethods([]));
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

  // Normal (low-risk) transitions: apply optimistically, delay the real
  // PATCH by UNDO_WINDOW_MS. Nothing is persisted unless the window elapses
  // without the seller clicking "Deshacer".
  const scheduleNormalChange = (
    orderId: string,
    field: "paymentStatus" | "fulfillmentStatus",
    previousValue: string,
    nextValue: string,
    label: string,
    commit: () => Promise<void>,
  ) => {
    setOrders((prev) => prev.map((o) => (o.id === orderId ? ({ ...o, [field]: nextValue } as Order) : o)));

    const timeoutId = setTimeout(() => {
      setPendingChange((prev) => {
        const { [orderId]: _removed, ...rest } = prev;
        return rest;
      });
      commit();
    }, UNDO_WINDOW_MS);

    setPendingChange((prev) => ({ ...prev, [orderId]: { field, previousValue } }));

    toast(t("undoToast.message", { status: label }), {
      duration: UNDO_WINDOW_MS,
      action: {
        label: t("undoToast.undo"),
        onClick: () => {
          clearTimeout(timeoutId);
          setOrders((prev) =>
            prev.map((o) => (o.id === orderId ? ({ ...o, [field]: previousValue } as Order) : o)),
          );
          setPendingChange((prev) => {
            const { [orderId]: _removed, ...rest } = prev;
            return rest;
          });
        },
      },
    });
  };

  const handleReviewClick = (order: Order, decision: "approve" | "reject") => {
    const label = paymentActionLabels[decision];
    if (decision === "reject") {
      setConfirmTarget({ orderId: order.id, kind: "review", decision, label });
      return;
    }
    scheduleNormalChange(order.id, "paymentStatus", order.paymentStatus, "VERIFIED", label, () =>
      handleReview(order.id, decision),
    );
  };

  const handleAdvanceClick = (order: Order) => {
    const next = NEXT_FULFILLMENT[order.fulfillmentStatus];
    if (!next) return;
    const label = fulfillmentLabels[next] ?? next;
    if (SENSITIVE_FULFILLMENT.has(next)) {
      setConfirmTarget({ orderId: order.id, kind: "advance", nextStatus: next, label });
      return;
    }
    scheduleNormalChange(order.id, "fulfillmentStatus", order.fulfillmentStatus, next, label, () =>
      handleAdvance(order.id, next),
    );
  };

  const handleConfirmTransition = async () => {
    if (!confirmTarget) return;
    if (confirmTarget.kind === "review" && confirmTarget.decision) {
      await handleReview(confirmTarget.orderId, confirmTarget.decision);
    } else if (confirmTarget.kind === "advance" && confirmTarget.nextStatus) {
      await handleAdvance(confirmTarget.orderId, confirmTarget.nextStatus);
    }
    setConfirmTarget(null);
  };

  const handleRegisterPayment = async (orderId: string) => {
    const amount = Number(paymentAmount);
    if (!storeId || !Number.isFinite(amount) || amount <= 0 || !paymentMethod) return;
    setPaymentSubmitting(true);
    try {
      const formData = new FormData();
      formData.append("amount", String(amount));
      formData.append("method", paymentMethod);
      if (paymentNote) formData.append("note", paymentNote);
      if (paymentImage) formData.append("file", paymentImage);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/stores/${storeId}/orders/${orderId}/payments`,
        {
          method: "POST",
          credentials: "include",
          body: formData,
        },
      );
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.message ?? tCommon("networkError"));

      setPaymentAmount("");
      setPaymentMethod("");
      setPaymentNote("");
      setPaymentImage(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      await loadOrders();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPaymentSubmitting(false);
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
    <div className="min-h-screen px-5 py-6 lg:px-8 lg:py-8 ">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between ">
          <div>
            <p className="text-sm font-medium text-[#8e7ca7]">
              {t("subtitle")}
            </p>
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

        <div className="flex flex-wrap items-center justify-between gap-3 ">
          <div className="flex items-center gap-2 rounded-2xl border border-[#eadcf7] bg-white p-1 overflow-x-auto">
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
            {t("showingCount", {
              count: filteredOrders.length,
              total: counts[activeTab],
            })}
          </p>
        </div>

        {error ? (
          <Card className="rounded-2xl border-[#f3cbd8] bg-[#fff3f7] py-0 shadow-none ">
            <CardContent className="px-4 py-3 text-sm text-[#b24368]">
              {error}
            </CardContent>
          </Card>
        ) : null}

        <Card className="rounded-[30px] border-[#eadcf8] bg-white py-0 shadow-sm overflow-x-auto">
          <CardContent className="px-0">
            {filteredOrders.length === 0 ? (
              <div className="px-6 py-10 text-sm text-[#8f7da8] ">
                {t("empty")}
              </div>
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
                    <th className="px-6 py-4 text-right">
                      {t("columns.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredOrders.map((order) => {
                    const number = getOrderNumber(order.id);
                    const initials = getInitials(
                      order.customerName,
                      order.customerPhone,
                    );
                    const customer = order.customerName ?? order.customerPhone;
                    const product = getProductSummary(order, t);
                    const delivery = getDeliveryLabel(order, t);
                    const date = formatOrderDate(order.createdAt, locale, t);
                    const status = getOrderStatus(order, t);
                    const avatar = order.items?.[0]?.product?.images?.[0];
                    return (
                      <tr
                        key={order.id}
                        className="border-b border-[#f3ebff] last:border-0 hover:bg-[#fcf9ff]"
                      >
                        <td className="px-6 py-4 text-xs font-semibold text-[#8f7da8]">
                          {number}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            {avatar ? (
                              <img
                                className="size-9 rounded-full object-cover"
                                src={avatar}
                                alt={customer}
                              />
                            ) : (
                              <div
                                className="flex size-9 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                                style={{
                                  background:
                                    "linear-gradient(135deg, var(--store-accent) 0%, var(--store-primary) 100%)",
                                }}
                              >
                                {initials}
                              </div>
                            )}
                            <p className="text-sm font-semibold text-[#2d1649]">
                              {customer}
                            </p>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-[#2d1649]">
                          {product}
                        </td>
                        <td className="px-6 py-4 text-sm font-semibold text-[var(--store-accent)]">
                          {order.currency} {order.totalAmount}
                        </td>
                        <td className="px-6 py-4 text-sm text-[#8f7da8]">
                          {delivery}
                        </td>
                        <td className="px-6 py-4 text-sm text-[#8f7da8]">
                          {date}
                        </td>
                        <td className="px-6 py-4">
                          <Badge
                            className={cn(
                              "rounded-full px-3 py-1 text-xs font-semibold",
                              status.className,
                            )}
                          >
                            {status.label}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex flex-wrap items-center justify-end gap-1.5">
                            {!pendingChange[order.id] &&
                              (order.paymentStatus === "PENDING_PAYMENT" ||
                                order.paymentStatus === "PAYMENT_SUBMITTED") && (
                                <>
                                  <Button
                                    type="button"
                                    onClick={() => handleReviewClick(order, "approve")}
                                    className="store-theme-primary-button h-8 rounded-full px-3 text-xs font-semibold hover:opacity-100"
                                  >
                                    {t("approve")}
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    onClick={() => handleReviewClick(order, "reject")}
                                    className="h-8 rounded-full border-[#eadcf7] bg-white px-3 text-xs font-semibold text-[#2d1649] shadow-none hover:bg-[#fcf9ff]"
                                  >
                                    {t("reject")}
                                  </Button>
                                </>
                              )}
                            {!pendingChange[order.id] &&
                              order.paymentStatus === "VERIFIED" &&
                              NEXT_FULFILLMENT[order.fulfillmentStatus] && (
                                <Button
                                  type="button"
                                  variant="outline"
                                  onClick={() => handleAdvanceClick(order)}
                                  className="h-8 rounded-full border-[#eadcf7] bg-white px-3 text-xs font-semibold text-[#2d1649] shadow-none hover:bg-[#fcf9ff]"
                                >
                                  {t("markAs", {
                                    status: fulfillmentLabels[NEXT_FULFILLMENT[order.fulfillmentStatus]!],
                                  })}
                                </Button>
                              )}
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
                          </div>
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
          {paymentPreviewUrl ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6"
              role="dialog"
              aria-modal="true"
              onClick={() => setPaymentPreviewUrl(null)}
            >
              <div
                className="max-h-[85vh] w-full max-w-3xl overflow-hidden rounded-2xl bg-white shadow-xl"
                onClick={(event) => event.stopPropagation()}
              >
                <img
                  src={paymentPreviewUrl}
                  alt=""
                  className="h-full w-full object-contain"
                />
              </div>
            </div>
          ) : null}
          <SheetContent className="h-dvh w-[420px] gap-0 overflow-y-auto sm:max-w-[420px]">
            {selectedOrder ? (
              <>
                <SheetHeader>
                  <SheetTitle>
                    {t("details.title", {
                      number: getOrderNumber(selectedOrder.id),
                    })}
                  </SheetTitle>
                  <SheetDescription>
                    {selectedOrder.customerName ?? selectedOrder.customerPhone}
                  </SheetDescription>
                </SheetHeader>

                <div className="space-y-6 px-4 pb-24 pt-4">
                  {/* Summary Block */}
                  <div className="space-y-4 rounded-[24px] border border-[#eadcf8] bg-gradient-to-b from-[#fcf9ff] to-white p-5 shadow-sm">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-[#8f7da8]">
                        {t("details.total")}
                      </span>
                      <span className="font-bold text-[#2d1649]">
                        {selectedOrder.currency} {selectedOrder.totalAmount}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-[#8f7da8]">
                        {t("details.paid")}
                      </span>
                      <span className="font-bold text-[#159a63]">
                        {selectedOrder.currency}{" "}
                        {selectedOrder.paidAmount.toFixed(2)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium text-[#8f7da8]">
                        {t("details.pending")}
                      </span>
                      <span className="font-bold text-[#d11d52]">
                        {selectedOrder.currency}{" "}
                        {selectedOrder.pendingAmount.toFixed(2)}
                      </span>
                    </div>

                    <div className="space-y-2.5 border-t border-[#f3ebff] pt-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-semibold text-[#2d1649]">
                          {t("details.progress")}
                        </span>
                        <span className="font-bold text-[var(--store-primary)]">
                          {Math.round(selectedOrder.paidPercentage)}%
                        </span>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-[#f0e7f8] shadow-inner">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-[var(--store-accent)] to-[var(--store-primary)] transition-all duration-500"
                          style={{ width: `${selectedOrder.paidPercentage}%` }}
                        />
                      </div>
                    </div>

                    <div className="space-y-2 border-t border-[#f3ebff] pt-3">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-[#8f7da8]">
                          {t("details.delivery")}
                        </span>
                        <span className="font-semibold text-[#2d1649]">
                          {getDeliveryLabel(selectedOrder, t)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium text-[#8f7da8]">
                          {t("details.date")}
                        </span>
                        <span className="font-semibold text-[#2d1649]">
                          {formatOrderDate(selectedOrder.createdAt, locale, t)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Payments Block */}
                  <div className="space-y-4 rounded-[24px] border border-[#eadcf8] bg-white p-5 shadow-sm">
                    <div className="flex items-center gap-2 text-[#2d1649]">
                      <Wallet className="size-5 text-[var(--store-primary)]" />
                      <h3 className="font-semibold">
                        {t("details.addPayment")}
                      </h3>
                    </div>

                    <div className="flex gap-2">
                      <Input
                        value={paymentAmount}
                        onChange={(event) =>
                          setPaymentAmount(event.target.value)
                        }
                        inputMode="decimal"
                        placeholder={t("details.paymentAmountPlaceholder")}
                        className="store-theme-input h-11 rounded-xl border-[#e7dcf3] bg-[#fbf8fe] shadow-none"
                      />
                      <Button
                        type="button"
                        onClick={() => handleRegisterPayment(selectedOrder.id)}
                        disabled={
                          paymentSubmitting ||
                          selectedOrder.pendingAmount <= 0 ||
                          !paymentAmount ||
                          !paymentMethod
                        }
                        className="store-theme-primary-button h-11 shrink-0 rounded-xl px-5 text-sm font-semibold hover:opacity-100"
                      >
                        {t("details.registerPayment")}
                      </Button>
                    </div>
                    <Select
                      value={paymentMethod}
                      onChange={(event) => setPaymentMethod(event.target.value)}
                      selectClassName="store-theme-input h-11 rounded-xl border-[#e7dcf3] bg-[#fbf8fe] text-sm text-[#341b55]"
                    >
                      <option value="" disabled>
                        {t("details.selectPaymentMethod")}
                      </option>
                      {enabledPaymentMethods.map((method) => (
                        <option key={method} value={method}>
                          {paymentMethodLabels[method] ?? method}
                        </option>
                      ))}
                    </Select>
                    <Input
                      value={paymentNote}
                      onChange={(event) => setPaymentNote(event.target.value)}
                      placeholder={t("details.paymentNotePlaceholder")}
                      className="store-theme-input h-11 rounded-xl border-[#e7dcf3] bg-[#fbf8fe] shadow-none"
                    />
                    <div className="space-y-2">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/png,image/jpeg"
                        className="hidden"
                        id="payment-image-upload"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          setPaymentImage(file);
                        }}
                      />

                      <label
                        htmlFor="payment-image-upload"
                        className={cn(
                          "flex cursor-pointer items-center justify-center gap-3 rounded-xl border border-dashed px-4 py-3 transition",
                          "border-[#d9c7ee] bg-[#fbf8fe] hover:bg-[#f7f0ff]",
                          paymentImage &&
                            "border-[var(--store-primary)] bg-[#faf5ff]",
                        )}
                      >
                        <div className="flex size-9 items-center justify-center rounded-full bg-[#f0e7f8]">
                          {paymentImage ? (
                            <ImageIcon className="size-4 text-[var(--store-primary)]" />
                          ) : (
                            <Upload className="size-4 text-[var(--store-primary)]" />
                          )}
                        </div>

                        <div className="flex-1">
                          {paymentImage ? (
                            <>
                              <p className="truncate text-sm font-semibold text-[#2d1649]">
                                {paymentImage.name}
                              </p>
                              <p className="text-xs text-[#8f7da8]">
                                {t("details.imageSize", {
                                  size: (paymentImage.size / 1024).toFixed(1),
                                })}
                              </p>
                            </>
                          ) : (
                            <>
                              <p className="text-sm font-semibold text-[#2d1649]">
                                {t("details.uploadPaymentImage")}
                              </p>

                              <p className="text-xs text-[#8f7da8]">
                                {t("details.uploadPaymentImageHint")}
                              </p>
                            </>
                          )}
                        </div>

                        {!paymentImage && (
                          <span className="rounded-full bg-[var(--store-primary)] px-3 py-1 text-xs font-semibold text-white">
                            {t("details.chooseImage")}
                          </span>
                        )}
                      </label>

                      {paymentImage && (
                        <div className="flex items-center justify-between rounded-xl border border-[#f0e7f8] bg-white p-2">
                          <div className="flex items-center gap-3">
                            <img
                              src={URL.createObjectURL(paymentImage)}
                              alt=""
                              className="size-12 rounded-lg object-cover"
                            />

                            <span className="text-xs text-[#8f7da8]">
                              {t("details.imagePreview")}
                            </span>
                          </div>

                          <Button
                            type="button"
                            variant="ghost"
                            className="size-8 rounded-full p-0 text-[#b24368] hover:bg-[#fff0f5]"
                            onClick={() => {
                              setPaymentImage(null);
                              if (fileInputRef.current) {
                                fileInputRef.current.value = "";
                              }
                            }}
                          >
                            <X className="size-4" />
                          </Button>
                        </div>
                      )}
                    </div>

                    {selectedOrder.payments.length > 0 && (
                      <div className="space-y-3 border-t border-[#f3ebff] pt-4">
                        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#927fac]">
                          {t("details.paymentHistory", {
                            fallback: "Historial de abonos",
                          })}
                        </p>
                        <div className="space-y-2">
                          {selectedOrder.payments.map((payment) => (
                            <div
                              key={payment.id}
                              className="flex items-start gap-3 rounded-xl border border-[#f0e7f8] bg-[#fcf9ff] p-3 transition hover:bg-white"
                            >
                              <div
                                className={cn(
                                  "mt-0.5 flex size-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#f0e7f8] text-[var(--store-primary)]",
                                  payment.imageUrl ? "cursor-pointer" : "",
                                )}
                                onClick={() => {
                                  if (!payment.imageUrl) return;
                                  setPaymentPreviewUrl(payment.imageUrl);
                                }}
                              >
                                {payment.imageUrl ? (
                                  <img
                                    src={payment.imageUrl}
                                    alt=""
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <Receipt className="size-3.5" />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-bold text-[#2d1649]">
                                    {selectedOrder.currency} {payment.amount}
                                    {payment.method ? (
                                      <span className="ml-1 font-medium text-[#8f7da8]">
                                        · {paymentMethodLabels[payment.method] ?? payment.method}
                                      </span>
                                    ) : null}
                                  </span>
                                  <span className="text-[11px] font-medium text-[#8f7da8]">
                                    {formatOrderDate(
                                      payment.createdAt,
                                      locale,
                                      t,
                                    )}
                                  </span>
                                </div>
                                {payment.note ? (
                                  <p className="mt-1 truncate text-xs text-[#6e5a87]">
                                    {payment.note}
                                  </p>
                                ) : null}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
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
                              {item.variant?.name
                                ? ` (${item.variant.name})`
                                : ""}
                            </p>
                            <p className="text-xs text-[#8f7da8]">
                              {t("details.quantity", { count: item.quantity })}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <SheetFooter className="sticky bottom-0 border-t border-[#f0e7f8] bg-white px-4 py-4">
                  <div className="flex w-full flex-wrap gap-2">
                    {!pendingChange[selectedOrder.id] &&
                      (selectedOrder.paymentStatus === "PENDING_PAYMENT" ||
                        selectedOrder.paymentStatus === "PAYMENT_SUBMITTED") && (
                        <>
                          <Button
                            type="button"
                            onClick={() => handleReviewClick(selectedOrder, "approve")}
                            className="store-theme-primary-button h-11 flex-1 rounded-2xl text-sm font-semibold hover:opacity-100"
                          >
                            {t("approve")}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => handleReviewClick(selectedOrder, "reject")}
                            className="h-11 flex-1 rounded-2xl border-[#eadcf7] bg-white text-sm font-semibold text-[#2d1649] shadow-none hover:bg-[#fcf9ff]"
                          >
                            {t("reject")}
                          </Button>
                        </>
                      )}
                    {!pendingChange[selectedOrder.id] &&
                    selectedOrder.paymentStatus === "VERIFIED" &&
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

        <AlertDialog
          open={!!confirmTarget}
          onOpenChange={(open) => {
            if (!open) setConfirmTarget(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{t("confirmStatus.title")}</AlertDialogTitle>
              <AlertDialogDescription>
                {confirmTarget ? t("confirmStatus.body", { status: confirmTarget.label }) : null}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmTarget(null)}
                className="h-11 rounded-2xl border-[#eadcf7] bg-white text-sm font-semibold text-[#2d1649] shadow-none hover:bg-[#fcf9ff]"
              >
                {t("confirmStatus.cancel")}
              </Button>
              <Button
                type="button"
                onClick={handleConfirmTransition}
                className="store-theme-primary-button h-11 rounded-2xl text-sm font-semibold hover:opacity-100"
              >
                {t("confirmStatus.confirm")}
              </Button>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
