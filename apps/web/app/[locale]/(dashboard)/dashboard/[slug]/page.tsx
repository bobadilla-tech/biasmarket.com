"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AlertTriangle, Clock, ShoppingBag, Wallet } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadingState } from "@/components/shared/loading-state";
import { ErrorState } from "@/components/shared/error-state";
import { useDashboardStore } from "@/features/stores";
import { RecentOrdersList, StatTile, useStatsOverview } from "@/features/stats";
import type {
  FulfillmentStatusValue,
  PaymentStatusValue,
} from "@/features/stats";

export default function DashboardOverviewPage() {
  const t = useTranslations("dashboard.overview");
  const tCommon = useTranslations("common");
  const { locale } = useParams<{ locale: string }>();
  const { storeId, loading: storeLoading } = useDashboardStore();
  const { stats, loading: statsLoading, error } = useStatsOverview(storeId);

  if (storeLoading || statsLoading) {
    return <LoadingState />;
  }

  if (error || !stats) {
    return (
      <div className="px-5 py-6 lg:px-8 lg:py-8">
        <ErrorState message={error ?? tCommon("networkError")} />
      </div>
    );
  }

  const pendingReview = stats.paymentStatusCounts.PENDING_PAYMENT +
    stats.paymentStatusCounts.PARTIALLY_PAID +
    stats.paymentStatusCounts.PAYMENT_SUBMITTED;

  return (
    <div className="min-h-screen px-5 py-6 lg:px-8 lg:py-8">
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-[#2d1649]">
            {t("title")}
          </h1>
          <p className="mt-1 text-sm text-[#8f7da8]">{t("subtitle")}</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatTile
            icon={Wallet}
            label={t("stats.revenue")}
            value={stats.revenue.toFixed(2)}
          />
          <StatTile
            icon={ShoppingBag}
            label={t("stats.totalOrders")}
            value={String(stats.totalOrders)}
          />
          <StatTile
            icon={Clock}
            label={t("stats.pendingReview")}
            value={String(pendingReview)}
          />
          <StatTile
            icon={AlertTriangle}
            label={t("stats.lowStock")}
            value={String(stats.lowStockCount)}
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)]">
          <RecentOrdersList orders={stats.recentOrders} locale={locale} />

          <div className="space-y-6">
            <StatusBreakdownCard
              title={t("paymentBreakdownTitle")}
              counts={stats.paymentStatusCounts}
              labels={{
                PENDING_PAYMENT: t("paymentStatusLabels.PENDING_PAYMENT"),
                PARTIALLY_PAID: t("paymentStatusLabels.PARTIALLY_PAID"),
                PAYMENT_SUBMITTED: t("paymentStatusLabels.PAYMENT_SUBMITTED"),
                VERIFIED: t("paymentStatusLabels.VERIFIED"),
                REJECTED: t("paymentStatusLabels.REJECTED"),
                CANCELLED: t("paymentStatusLabels.CANCELLED"),
              }}
            />
            <FulfillmentBreakdownCard
              title={t("fulfillmentBreakdownTitle")}
              counts={stats.fulfillmentStatusCounts}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBreakdownCard({
  title,
  counts,
  labels,
}: {
  title: string;
  counts: Record<PaymentStatusValue, number>;
  labels: Record<PaymentStatusValue, string>;
}) {
  return (
    <Card className="rounded-[26px] border-[#eadcf8] bg-white py-0 shadow-sm">
      <CardHeader className="px-5 pt-5">
        <CardTitle className="text-base font-semibold text-[#2d1649]">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <ul className="space-y-2.5">
          {(Object.keys(counts) as PaymentStatusValue[]).map((status) => (
            <li
              key={status}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-[#8f7da8]">{labels[status]}</span>
              <span className="font-semibold text-[#2d1649]">
                {counts[status]}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function FulfillmentBreakdownCard({
  title,
  counts,
}: {
  title: string;
  counts: Record<FulfillmentStatusValue, number>;
}) {
  const tOrders = useTranslations("dashboard.orders");
  const labels: Record<FulfillmentStatusValue, string> = {
    ORDERING: tOrders("fulfillmentLabels.ORDERING"),
    IN_TRANSIT: tOrders("fulfillmentLabels.IN_TRANSIT"),
    READY: tOrders("fulfillmentLabels.READY"),
    COMPLETED: tOrders("fulfillmentLabels.COMPLETED"),
  };

  return (
    <Card className="rounded-[26px] border-[#eadcf8] bg-white py-0 shadow-sm">
      <CardHeader className="px-5 pt-5">
        <CardTitle className="text-base font-semibold text-[#2d1649]">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        <ul className="space-y-2.5">
          {(Object.keys(counts) as FulfillmentStatusValue[]).map((status) => (
            <li
              key={status}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-[#8f7da8]">{labels[status]}</span>
              <span className="font-semibold text-[#2d1649]">
                {counts[status]}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
