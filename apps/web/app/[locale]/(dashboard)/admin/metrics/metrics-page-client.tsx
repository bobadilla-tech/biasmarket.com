"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { RefreshCw } from "lucide-react";
import {
  AdminMetricsView,
  useAdminMetrics,
  useAdminStores,
} from "@/features/admin";

type DateRangePreset = "all" | "30d" | "7d";

export function AdminMetricsPageClient() {
  const t = useTranslations("admin.metrics");
  const tCommon = useTranslations("common");

  const [datePreset, setDatePreset] = useState<DateRangePreset>("all");
  const [selectedStoreId, setSelectedStoreId] = useState<string>("");

  const storesQuery = useAdminStores();
  const stores = storesQuery.data ?? [];

  const metricsQuery = useAdminMetrics(
    {
      preset: datePreset,
      storeId: selectedStoreId || undefined,
    },
    tCommon("networkError"),
  );

  return (
    <div className="bg-gray-50/50 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        {/* Header & Filter Controls */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
              {t("title")}
            </h1>
            <p className="mt-1 text-sm text-gray-500">{t("subtitle")}</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Date Range Selector */}
            <div className="flex items-center rounded-xl border border-gray-200 bg-white p-1 shadow-sm">
              <button
                type="button"
                onClick={() => setDatePreset("all")}
                className={`min-h-[44px] rounded-lg px-3 py-2 text-xs font-medium transition ${
                  datePreset === "all"
                    ? "bg-gray-900 text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {t("filters.allTime")}
              </button>
              <button
                type="button"
                onClick={() => setDatePreset("30d")}
                className={`min-h-[44px] rounded-lg px-3 py-2 text-xs font-medium transition ${
                  datePreset === "30d"
                    ? "bg-gray-900 text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {t("filters.last30Days")}
              </button>
              <button
                type="button"
                onClick={() => setDatePreset("7d")}
                className={`min-h-[44px] rounded-lg px-3 py-2 text-xs font-medium transition ${
                  datePreset === "7d"
                    ? "bg-gray-900 text-white shadow-sm"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {t("filters.last7Days")}
              </button>
            </div>

            {/* Store Filter Dropdown */}
            {stores.length > 0 && (
              <div className="relative min-w-[180px]">
                <label htmlFor="store-filter" className="sr-only">
                  {t("filters.store")}
                </label>
                <select
                  id="store-filter"
                  value={selectedStoreId}
                  onChange={(e) => setSelectedStoreId(e.target.value)}
                  className="min-h-[44px] w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2 text-xs font-medium text-gray-700 shadow-sm focus:border-gray-900 focus:outline-none"
                >
                  <option value="">{t("filters.allStores")}</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Refresh Button */}
            <button
              type="button"
              onClick={() => metricsQuery.refetch()}
              aria-label={t("filters.refresh")}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-600 shadow-sm transition hover:bg-gray-50 hover:text-gray-900"
            >
              <RefreshCw
                className={`h-4 w-4 ${
                  metricsQuery.isFetching ? "animate-spin" : ""
                }`}
              />
            </button>
          </div>
        </div>

        {/* Loading State */}
        {metricsQuery.isPending && (
          <div className="flex min-h-[300px] items-center justify-center rounded-2xl border border-gray-100 bg-white p-8">
            <div className="flex flex-col items-center gap-3">
              <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
              <p className="text-sm text-gray-500">{tCommon("loading")}</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {metricsQuery.isError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-900 shadow-sm">
            <p className="text-sm font-semibold">
              {metricsQuery.error instanceof Error
                ? metricsQuery.error.message
                : tCommon("networkError")}
            </p>
            <button
              type="button"
              onClick={() => metricsQuery.refetch()}
              className="mt-3 min-h-[44px] rounded-lg bg-red-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-red-700"
            >
              {tCommon("errorPage.retry")}
            </button>
          </div>
        )}

        {/* Success View */}
        {metricsQuery.isSuccess && metricsQuery.data && (
          <AdminMetricsView data={metricsQuery.data} />
        )}
      </div>
    </div>
  );
}
