"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useDashboardStore } from "@/features/stores";
import {
  OrdersTabs,
  OrdersTable,
  OrderDetailSheet,
  PaymentProofLightbox,
  ConfirmTransitionDialog,
  useOrders,
  useEnabledPaymentMethods,
  useRegisterPayment,
  useOptimisticStatusChange,
  NEXT_FULFILLMENT,
  SENSITIVE_FULFILLMENT,
  matchesTab,
  type Order,
  type OrdersTab,
} from "@/features/orders";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : null;
}

export default function OrdersPage() {
  const t = useTranslations("dashboard.orders");
  const tCommon = useTranslations("common");
  const { storeId, loading: storeLoading } = useDashboardStore();

  const ordersQuery = useOrders(storeId, tCommon("networkError"));
  const orders = ordersQuery.data ?? [];
  const enabledMethodsQuery = useEnabledPaymentMethods(storeId, tCommon("networkError"));
  const enabledMethods = enabledMethodsQuery.data ?? [];

  const [activeTab, setActiveTab] = useState<OrdersTab>("all");
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [paymentPreviewUrl, setPaymentPreviewUrl] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{
    orderId: string;
    kind: "review" | "advance";
    decision?: "approve" | "reject";
    nextStatus?: string;
    label: string;
  } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const { pending, scheduleReview, scheduleAdvance, reviewPayment, advanceFulfillment } =
    useOptimisticStatusChange(storeId, t);
  const registerPayment = useRegisterPayment(storeId, tCommon("networkError"));

  const error =
    errorMessage(ordersQuery.error) ??
    errorMessage(reviewPayment.error) ??
    errorMessage(advanceFulfillment.error) ??
    errorMessage(registerPayment.error);

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
  const tabLabels: Record<OrdersTab, string> = {
    all: t("tabs.all"),
    pending: t("tabs.pending"),
    transit: t("tabs.transit"),
    delivered: t("tabs.delivered"),
  };

  const handleReviewClick = (order: Order, decision: "approve" | "reject") => {
    const label = paymentActionLabels[decision];
    if (decision === "reject") {
      setConfirmTarget({ orderId: order.id, kind: "review", decision, label });
      return;
    }
    scheduleReview(order, label);
  };

  const handleAdvanceClick = (order: Order) => {
    const next = NEXT_FULFILLMENT[order.fulfillmentStatus];
    if (!next) return;
    const label = fulfillmentLabels[next] ?? next;
    if (SENSITIVE_FULFILLMENT.has(next)) {
      setConfirmTarget({ orderId: order.id, kind: "advance", nextStatus: next, label });
      return;
    }
    scheduleAdvance(order, next, label);
  };

  const handleConfirmTransition = async () => {
    if (!confirmTarget) return;
    if (confirmTarget.kind === "review" && confirmTarget.decision) {
      await reviewPayment.mutateAsync({
        orderId: confirmTarget.orderId,
        decision: confirmTarget.decision,
        ...(confirmTarget.decision === "reject" && { reason: rejectReason.trim() }),
      });
    } else if (confirmTarget.kind === "advance" && confirmTarget.nextStatus) {
      await advanceFulfillment.mutateAsync({ orderId: confirmTarget.orderId, status: confirmTarget.nextStatus });
    }
    setConfirmTarget(null);
    setRejectReason("");
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
          <OrdersTabs activeTab={activeTab} onChange={setActiveTab} labels={tabLabels} />
          <p className="text-sm text-[#8f7da8]">
            {t("showingCount", { count: filteredOrders.length, total: counts[activeTab] })}
          </p>
        </div>

        {error ? (
          <Card className="rounded-2xl border-[#f3cbd8] bg-[#fff3f7] py-0 shadow-none">
            <CardContent className="px-4 py-3 text-sm text-[#b24368]">{error}</CardContent>
          </Card>
        ) : null}

        <Card className="overflow-x-auto rounded-[30px] border-[#eadcf8] bg-white py-0 shadow-sm">
          <CardContent className="px-0">
            <OrdersTable
              orders={filteredOrders}
              pendingOrderIds={new Set(Object.keys(pending))}
              fulfillmentLabels={fulfillmentLabels}
              onApprove={(order) => handleReviewClick(order, "approve")}
              onReject={(order) => handleReviewClick(order, "reject")}
              onAdvance={handleAdvanceClick}
              onView={(order) => {
                setSelectedOrderId(order.id);
                setDetailsOpen(true);
              }}
            />
          </CardContent>
        </Card>

        <PaymentProofLightbox url={paymentPreviewUrl} onClose={() => setPaymentPreviewUrl(null)} />

        <OrderDetailSheet
          open={detailsOpen}
          onOpenChange={(open) => {
            setDetailsOpen(open);
            if (!open) setSelectedOrderId(null);
          }}
          order={selectedOrder}
          isPending={selectedOrder ? !!pending[selectedOrder.id] : false}
          fulfillmentLabels={fulfillmentLabels}
          enabledMethods={enabledMethods}
          registerPaymentSubmitting={registerPayment.isPending}
          onRegisterPayment={(values) => {
            if (!selectedOrder) return Promise.resolve();
            return registerPayment.mutateAsync({ orderId: selectedOrder.id, values });
          }}
          onPreviewPayment={setPaymentPreviewUrl}
          onApprove={() => selectedOrder && handleReviewClick(selectedOrder, "approve")}
          onReject={() => selectedOrder && handleReviewClick(selectedOrder, "reject")}
          onAdvance={async () => {
            if (!selectedOrder) return;
            const next = NEXT_FULFILLMENT[selectedOrder.fulfillmentStatus];
            if (!next) return;
            await advanceFulfillment.mutateAsync({ orderId: selectedOrder.id, status: next });
            setDetailsOpen(false);
          }}
        />

        <ConfirmTransitionDialog
          open={!!confirmTarget}
          label={confirmTarget?.label ?? null}
          pending={reviewPayment.isPending || advanceFulfillment.isPending}
          onCancel={() => {
            setConfirmTarget(null);
            setRejectReason("");
          }}
          onConfirm={handleConfirmTransition}
          {...(confirmTarget?.kind === "review" &&
            confirmTarget.decision === "reject" && {
              reason: rejectReason,
              onReasonChange: setRejectReason,
              reasonRequired: true,
            })}
        />
      </div>
    </div>
  );
}
