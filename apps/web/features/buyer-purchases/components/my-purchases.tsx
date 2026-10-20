"use client";

import { ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import type { GlobalAccountOrderResponseDto } from "@biasmarket/types";
import { Link } from "@/i18n/navigation";
import { OrderStatusBadge } from "@/features/orders";
import { LoadingState } from "@/components/shared/loading-state";
import {
  useGlobalAccount,
  useGlobalOrders,
} from "../queries/use-global-account";

interface StoreGroup {
  slug: string;
  name: string;
  orders: GlobalAccountOrderResponseDto[];
}

// Orders arrive newest-first across every store; grouping keeps that order
// both between groups (a store appears where its newest order sits) and
// inside each group.
function groupByStore(orders: GlobalAccountOrderResponseDto[]): StoreGroup[] {
  const groups = new Map<string, StoreGroup>();
  for (const order of orders) {
    const group = groups.get(order.storeSlug) ?? {
      slug: order.storeSlug,
      name: order.storeName,
      orders: [],
    };
    group.orders.push(order);
    groups.set(order.storeSlug, group);
  }
  return [...groups.values()];
}

export function MyPurchases() {
  const t = useTranslations("storefront.myPurchases");
  const profile = useGlobalAccount();
  const orders = useGlobalOrders(Boolean(profile.data));

  if (profile.isPending) return <LoadingState />;

  if (profile.isError) {
    return (
      <div className="rounded-2xl border border-gray-100 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-gray-900">
          {t("loggedOutTitle")}
        </h1>
        <p className="mt-2 text-sm text-gray-600">{t("loggedOutBody")}</p>
        <Link
          href="/stores"
          className="mt-5 inline-block rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-800"
        >
          {t("browseStores")}
        </Link>
      </div>
    );
  }

  const groups = groupByStore(orders.data ?? []);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">{t("title")}</h1>
        <p className="mt-1 text-sm text-gray-600">
          {profile.data.name ?? profile.data.phone}
        </p>
      </div>

      {orders.isPending ? (
        <LoadingState />
      ) : groups.length === 0 ? (
        <p className="text-sm text-gray-500">{t("empty")}</p>
      ) : (
        groups.map((group) => (
          <section key={group.slug} className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-gray-900">
                {group.name}
              </h2>
              <Link
                href={`/store/${group.slug}/account`}
                className="text-sm font-medium text-emerald-700 hover:underline"
              >
                {t("storeAccount")}
              </Link>
            </div>
            {group.orders.map((order) => (
              <Link
                key={order.id}
                href={`/store/${group.slug}/account/orders/${order.id}`}
                className="flex items-center justify-between gap-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition hover:border-gray-200 hover:shadow-md"
              >
                <div>
                  <p className="text-sm font-semibold text-gray-900">
                    #{order.id.slice(0, 8)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-end gap-1.5">
                    <OrderStatusBadge order={order} />
                    {order.pendingAmount > 0 && (
                      <p className="text-xs text-rose-600">
                        {t("pendingBalance", {
                          currency: order.currency,
                          amount: order.pendingAmount.toFixed(2),
                        })}
                      </p>
                    )}
                    <p className="text-sm font-semibold text-gray-900">
                      {order.currency} {order.totalAmount}
                    </p>
                  </div>
                  <ChevronRight className="size-4 shrink-0 text-gray-400" />
                </div>
              </Link>
            ))}
          </section>
        ))
      )}
    </div>
  );
}
