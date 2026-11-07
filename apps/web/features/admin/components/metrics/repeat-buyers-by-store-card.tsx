"use client";

import { useTranslations } from "next-intl";
import { EmptyState } from "@/components/shared/empty-state";
import type { StoreRepeatBuyerMetrics } from "../../api/admin-metrics.api";

interface RepeatBuyersByStoreCardProps {
  rows: StoreRepeatBuyerMetrics[];
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function RepeatBuyersByStoreCard({
  rows,
}: RepeatBuyersByStoreCardProps) {
  const t = useTranslations("admin.metrics.repeatBuyers");
  const tTable = useTranslations("admin.metrics.table");

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-bold text-gray-900">{t("title")}</h2>
        <p className="text-xs text-gray-500 sm:text-sm">{t("subtitle")}</p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        {rows.length === 0 ? (
          <EmptyState message={t("empty")} />
        ) : (
          <table
            data-testid="repeat-buyers-table"
            className="w-full min-w-[560px] text-sm"
          >
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                <th className="px-6 py-3.5 font-medium">{tTable("store")}</th>
                <th className="px-6 py-3.5 text-right font-medium">
                  {tTable("distinctBuyers")}
                </th>
                <th className="px-6 py-3.5 text-right font-medium">
                  {tTable("repeatBuyers")}
                </th>
                <th className="px-6 py-3.5 text-right font-medium">
                  {tTable("repeatRate")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((row) => (
                <tr key={row.storeId} className="hover:bg-gray-50/50">
                  <td className="px-6 py-3.5 font-medium text-gray-900">
                    {row.storeName}
                  </td>
                  <td className="px-6 py-3.5 text-right text-gray-600">
                    {row.distinctBuyers.toLocaleString()}
                  </td>
                  <td className="px-6 py-3.5 text-right text-gray-600">
                    {row.repeatBuyers.toLocaleString()}
                  </td>
                  <td className="px-6 py-3.5 text-right">
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                        row.repeatBuyerRate > 0
                          ? "bg-purple-50 text-purple-700"
                          : "text-gray-500"
                      }`}
                    >
                      {formatPercent(row.repeatBuyerRate)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
