import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { OrderStatusBadge } from "@/features/orders";
import type { AccountOrderResponseDto } from "@biasmarket/types";

export function AccountOrderCard(
  { slug, order }: { slug: string; order: AccountOrderResponseDto },
) {
  return (
    <Link
      href={`/store/${slug}/account/orders/${order.id}`}
      className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:border-gray-200 hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
    >
      <div>
        <p className="text-sm font-semibold text-gray-900">
          #{order.id.slice(0, 8)}
        </p>
        <p className="text-xs text-gray-500">
          {new Date(order.createdAt).toLocaleDateString()}
        </p>
      </div>
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
          <OrderStatusBadge order={order} />
          <p className="text-sm font-semibold text-gray-900">
            {order.currency} {order.totalAmount}
          </p>
        </div>
        <ChevronRight className="hidden size-4 shrink-0 text-gray-400 sm:block" />
      </div>
    </Link>
  );
}
