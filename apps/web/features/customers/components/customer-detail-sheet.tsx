"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { LoadingState } from "@/components/shared/loading-state";
import { EmptyState } from "@/components/shared/empty-state";
import { formatOrderDate, OrderStatusBadge } from "@/features/orders";
import { useCustomer } from "../queries/use-customers";

export function CustomerDetailSheet({
  storeId,
  customerId,
  open,
  onOpenChange,
}: {
  storeId: string | undefined;
  customerId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("dashboard.customers");
  const tOrders = useTranslations("dashboard.orders");
  const tCommon = useTranslations("common");
  const { locale } = useParams<{ locale: string }>();
  const { data, isPending } = useCustomer(
    storeId,
    customerId,
    tCommon("networkError"),
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="h-dvh w-[420px] gap-0 overflow-y-auto sm:max-w-[420px]">
        {isPending ? <LoadingState /> : data
          ? (
            <>
              <SheetHeader>
                <SheetTitle>
                  {data.customer.name ?? data.customer.phone}
                </SheetTitle>
                <SheetDescription>{data.customer.phone}</SheetDescription>
              </SheetHeader>

              <div className="space-y-3 px-4 pb-8 pt-4">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#927fac]">
                  {t("orderHistory")}
                </p>
                {data.orders.length === 0
                  ? <EmptyState message={t("noOrders")} />
                  : (
                    <div className="space-y-2">
                      {data.orders.map((order) => (
                        <div
                          key={order.id}
                          className="flex items-center justify-between rounded-2xl border border-[#f0e7f8] bg-white px-4 py-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-[#2d1649]">
                              {order.currency} {order.totalAmount}
                            </p>
                            <p className="text-xs text-[#8f7da8]">
                              {formatOrderDate(
                                order.createdAt,
                                locale,
                                tOrders,
                              )}
                            </p>
                          </div>
                          <OrderStatusBadge order={order} />
                        </div>
                      ))}
                    </div>
                  )}
              </div>
            </>
          )
          : null}
      </SheetContent>
    </Sheet>
  );
}
