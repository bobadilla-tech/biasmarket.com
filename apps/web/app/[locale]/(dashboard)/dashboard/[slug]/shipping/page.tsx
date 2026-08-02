"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/shared/loading-state";
import { ErrorState } from "@/components/shared/error-state";
import { useDashboardStore } from "@/features/stores";
import {
  useOrders,
  useOptimisticStatusChange,
  OrdersTable,
  OrderStatusBadge,
  ConfirmTransitionDialog,
  NEXT_FULFILLMENT,
  SENSITIVE_FULFILLMENT,
  getOrderNumber,
  formatOrderDate,
  getDeliveryLabel,
  type Order,
} from "@/features/orders";

const SHIPPING_FULFILLMENT_STATUSES = new Set(["ORDERING", "IN_TRANSIT", "READY"]);

export default function ShippingPage() {
  const t = useTranslations("dashboard.shipping");
  const tOrders = useTranslations("dashboard.orders");
  const tCommon = useTranslations("common");
  const { locale } = useParams<{ locale: string }>();
  const { storeId, loading: storeLoading } = useDashboardStore();
  const { data: orders, isPending: ordersLoading, error } = useOrders(storeId, tCommon("networkError"));
  const { pending, scheduleAdvance, advanceFulfillment } = useOptimisticStatusChange(storeId, tOrders);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<{
    orderId: string;
    nextStatus: string;
    label: string;
  } | null>(null);

  const fulfillmentLabels: Record<string, string> = {
    ORDERING: tOrders("fulfillmentLabels.ORDERING"),
    IN_TRANSIT: tOrders("fulfillmentLabels.IN_TRANSIT"),
    READY: tOrders("fulfillmentLabels.READY"),
    COMPLETED: tOrders("fulfillmentLabels.COMPLETED"),
  };

  const shippingOrders = useMemo(
    () =>
      (orders ?? []).filter(
        (order) =>
          order.paymentStatus === "VERIFIED" && SHIPPING_FULFILLMENT_STATUSES.has(order.fulfillmentStatus),
      ),
    [orders],
  );

  const selectedOrder = useMemo(
    () => shippingOrders.find((order) => order.id === selectedOrderId) ?? null,
    [shippingOrders, selectedOrderId],
  );

  const handleAdvance = (order: Order) => {
    const next = NEXT_FULFILLMENT[order.fulfillmentStatus];
    if (!next) return;
    const label = fulfillmentLabels[next] ?? next;
    if (SENSITIVE_FULFILLMENT.has(next)) {
      setConfirmTarget({ orderId: order.id, nextStatus: next, label });
      return;
    }
    scheduleAdvance(order, next, label);
  };

  const handleConfirm = async () => {
    if (!confirmTarget) return;
    await advanceFulfillment.mutateAsync({
      orderId: confirmTarget.orderId,
      status: confirmTarget.nextStatus,
    });
    setConfirmTarget(null);
  };

  if (storeLoading || ordersLoading) {
    return <LoadingState />;
  }

  if (error) {
    return (
      <div className="px-5 py-6 lg:px-8 lg:py-8">
        <ErrorState message={error instanceof Error ? error.message : tCommon("networkError")} />
      </div>
    );
  }

  return (
    <div className="min-h-screen px-5 py-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div>
          <p className="text-sm font-medium text-[#8e7ca7]">{t("subtitle")}</p>
          <h1 className="text-3xl font-bold tracking-tight text-[#2d1649]">
            {t("titleWithCount", { count: shippingOrders.length })}
          </h1>
        </div>

        <Card className="overflow-x-auto rounded-[30px] border-[#eadcf8] bg-white py-0 shadow-sm">
          <CardContent className="px-0">
            {shippingOrders.length === 0 ? (
              <div className="px-6 py-10 text-sm text-[#8f7da8]">{t("empty")}</div>
            ) : (
              <OrdersTable
                orders={shippingOrders}
                pendingOrderIds={new Set(Object.keys(pending))}
                fulfillmentLabels={fulfillmentLabels}
                onApprove={() => undefined}
                onReject={() => undefined}
                onAdvance={handleAdvance}
                onView={(order) => {
                  setSelectedOrderId(order.id);
                  setDetailsOpen(true);
                }}
              />
            )}
          </CardContent>
        </Card>
      </div>

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
                <SheetTitle>
                  {tOrders("details.title", { number: getOrderNumber(selectedOrder.id) })}
                </SheetTitle>
                <SheetDescription>
                  {selectedOrder.customerName ?? selectedOrder.customerPhone}
                </SheetDescription>
              </SheetHeader>

              <div className="space-y-6 px-4 pb-24 pt-4">
                <div className="space-y-3 rounded-[24px] border border-[#eadcf8] bg-gradient-to-b from-[#fcf9ff] to-white p-5 shadow-sm">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-[#8f7da8]">{tOrders("details.delivery")}</span>
                    <span className="font-semibold text-[#2d1649]">
                      {getDeliveryLabel(selectedOrder, tOrders)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-[#8f7da8]">{tOrders("details.date")}</span>
                    <span className="font-semibold text-[#2d1649]">
                      {formatOrderDate(selectedOrder.createdAt, locale, tOrders)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-[#8f7da8]">{tOrders("columns.status")}</span>
                    <OrderStatusBadge order={selectedOrder} />
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#927fac]">
                    {tOrders("details.items")}
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
                          <p className="text-xs text-[#8f7da8]">
                            {tOrders("details.quantity", { count: item.quantity })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <SheetFooter className="sticky bottom-0 border-t border-[#f0e7f8] bg-white px-4 py-4">
                {NEXT_FULFILLMENT[selectedOrder.fulfillmentStatus] ? (
                  <Button
                    type="button"
                    className="store-theme-primary-button h-11 w-full rounded-2xl text-sm font-semibold hover:opacity-100"
                    onClick={() => {
                      handleAdvance(selectedOrder);
                      setDetailsOpen(false);
                    }}
                  >
                    {tOrders("markAs", {
                      status: fulfillmentLabels[NEXT_FULFILLMENT[selectedOrder.fulfillmentStatus]!],
                    })}
                  </Button>
                ) : null}
              </SheetFooter>
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <ConfirmTransitionDialog
        open={!!confirmTarget}
        label={confirmTarget?.label ?? null}
        pending={advanceFulfillment.isPending}
        onCancel={() => setConfirmTarget(null)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
