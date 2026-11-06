"use client";

import { useTranslations } from "next-intl";
import type { WeeklyStoreBreakdown } from "../../api/admin-metrics.api";

interface WeeklyStoreBreakdownTableProps {
  breakdown: WeeklyStoreBreakdown[];
}

function formatCurrency(amount: number): string {
  return `S/ ${amount.toFixed(2)}`;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function WeeklyStoreBreakdownTable({
  breakdown,
}: WeeklyStoreBreakdownTableProps) {
  const t = useTranslations("admin.metrics.table");

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-bold text-gray-900">{t("title")}</h2>
        <p className="text-xs text-gray-500 sm:text-sm">{t("subtitle")}</p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        {breakdown.length === 0 ? (
          <p className="px-6 py-10 text-center text-sm text-gray-500">
            {t("empty")}
          </p>
        ) : (
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                <th className="px-6 py-3.5 font-medium">{t("week")}</th>
                <th className="px-6 py-3.5 font-medium">{t("store")}</th>
                <th className="px-6 py-3.5 text-right font-medium">
                  {t("assistedOrders")}
                </th>
                <th className="px-6 py-3.5 text-right font-medium">
                  {t("marketplaceOrders")}
                </th>
                <th className="px-6 py-3.5 text-right font-medium">
                  {t("assistedRevenue")}
                </th>
                <th className="px-6 py-3.5 text-right font-medium">
                  {t("marketplaceRevenue")}
                </th>
                <th className="px-6 py-3.5 text-right font-medium">
                  {t("distinctBuyers")}
                </th>
                <th className="px-6 py-3.5 text-right font-medium">
                  {t("repeatBuyers")}
                </th>
                <th className="px-6 py-3.5 text-right font-medium">
                  {t("repeatRate")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {breakdown.map((row) => (
                <tr
                  key={`${row.weekStartDate}-${row.storeId}`}
                  className="hover:bg-gray-50/50"
                >
                  <td className="px-6 py-3.5 whitespace-nowrap text-gray-600 font-mono text-xs">
                    {row.weekStartDate}
                  </td>
                  <td className="px-6 py-3.5 font-medium text-gray-900">
                    {row.storeName}
                  </td>
                  <td className="px-6 py-3.5 text-right font-medium text-gray-900">
                    {row.assistedOrdersCount.toLocaleString()}
                  </td>
                  <td className="px-6 py-3.5 text-right text-gray-600">
                    {row.marketplaceOrdersCount.toLocaleString()}
                  </td>
                  <td className="px-6 py-3.5 text-right text-gray-900">
                    {formatCurrency(row.assistedRevenue)}
                  </td>
                  <td className="px-6 py-3.5 text-right text-gray-600">
                    {formatCurrency(row.marketplaceRevenue)}
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
