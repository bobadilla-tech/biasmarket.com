"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { LoadingState } from "@/components/shared/loading-state";
import { ErrorState } from "@/components/shared/error-state";
import { useDashboardStore } from "@/features/stores";
import {
  type AnalyticsRange,
  analyticsRangeValues,
  NewVsReturningChart,
  SingleSeriesBarChart,
  TopProductsList,
  useAnalytics,
} from "@/features/stats";

function bucketLabel(startIso: string, range: AnalyticsRange, locale: string) {
  const date = new Date(startIso);
  if (range === "12m") {
    return new Intl.DateTimeFormat(locale, { month: "short" }).format(date);
  }
  return new Intl.DateTimeFormat(locale, { day: "2-digit", month: "short" })
    .format(date);
}

export function AnalyticsPageClient() {
  const t = useTranslations("dashboard.analytics");
  const tCommon = useTranslations("common");
  const { locale } = useParams<{ locale: string }>();
  const { store, storeId, loading: storeLoading } = useDashboardStore();
  const [range, setRange] = useState<AnalyticsRange>("30d");
  const { analytics, loading, error } = useAnalytics(storeId, range);

  const currency = store?.defaultCurrency ?? "PEN";

  const chartData = useMemo(
    () =>
      (analytics?.buckets ?? []).map((bucket) => ({
        label: bucketLabel(bucket.start, range, locale),
        revenue: bucket.revenue,
        orderCount: bucket.orderCount,
        newCustomers: bucket.newCustomers,
        returningCustomers: bucket.returningCustomers,
      })),
    [analytics, range, locale],
  );

  const rangeLabels: Record<AnalyticsRange, string> = {
    "30d": t("range.30d"),
    "90d": t("range.90d"),
    "12m": t("range.12m"),
  };

  if (storeLoading || loading) {
    return <LoadingState />;
  }

  return (
    <div className="min-h-screen px-5 py-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-medium text-[#8e7ca7]">
              {t("subtitle")}
            </p>
            <h1 className="text-3xl font-bold tracking-tight text-[#2d1649]">
              {t("title")}
            </h1>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto rounded-2xl border border-[#eadcf7] bg-white p-1">
            {analyticsRangeValues.map((value) => (
              <Button
                key={value}
                type="button"
                variant="ghost"
                onClick={() => setRange(value)}
                className={cn(
                  "h-9 rounded-2xl px-4 text-sm font-semibold",
                  range === value
                    ? "store-theme-primary-button"
                    : "text-[#8f7da8] hover:bg-[#fcf9ff] hover:text-[#2d1649]",
                )}
              >
                {rangeLabels[value]}
              </Button>
            ))}
          </div>
        </div>

        {error || !analytics
          ? <ErrorState message={error ?? tCommon("networkError")} />
          : (
            <>
              <div className="grid gap-6 xl:grid-cols-2">
                <SingleSeriesBarChart
                  title={t("revenueTitle")}
                  data={chartData.map((d) => ({
                    label: d.label,
                    value: d.revenue,
                  }))}
                  valueFormatter={(value) => `${currency} ${value.toFixed(2)}`}
                />
                <SingleSeriesBarChart
                  title={t("ordersTitle")}
                  data={chartData.map((d) => ({
                    label: d.label,
                    value: d.orderCount,
                  }))}
                  color="#8f7da8"
                />
              </div>

              <div className="grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
                <NewVsReturningChart data={chartData} />
                <TopProductsList products={analytics.topProducts} />
              </div>
            </>
          )}
      </div>
    </div>
  );
}
