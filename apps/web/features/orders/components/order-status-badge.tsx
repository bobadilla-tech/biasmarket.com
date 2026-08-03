"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getOrderStatus } from "../lib/order-status";
import type { Order } from "../schemas/order.schema";

export function OrderStatusBadge({ order }: { order: Order }) {
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
