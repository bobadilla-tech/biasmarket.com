"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { OrderResponseDto } from "@biasmarket/types";
import { getOrderStatus } from "../lib/order-status";

export function OrderStatusBadge(
  { order }: {
    order: Pick<
      OrderResponseDto,
      "paymentStatus" | "fulfillmentStatus" | "pendingAmount"
    >;
  },
) {
  const t = useTranslations("dashboard.orders");
  const status = getOrderStatus(order, t);
  return (
    <Badge
      className={cn(
        "rounded-full px-3 py-1 text-xs font-semibold",
        status.className,
      )}
    >
      {status.label}
    </Badge>
  );
}
