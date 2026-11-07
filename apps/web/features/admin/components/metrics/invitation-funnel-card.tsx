"use client";

import { useTranslations } from "next-intl";
import type { InvitationFunnelMetrics } from "../../api/admin-metrics.api";

interface InvitationFunnelCardProps {
  funnel: InvitationFunnelMetrics;
}

export function InvitationFunnelCard({ funnel }: InvitationFunnelCardProps) {
  const t = useTranslations("admin.metrics.funnel");

  const getMomentLabel = (momentKey: string): string => {
    try {
      return t(`moments.${momentKey}` as any);
    } catch {
      return momentKey;
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <h2 className="text-lg font-bold text-gray-900">{t("title")}</h2>
        <p className="text-xs text-gray-500 sm:text-sm">{t("subtitle")}</p>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
              <th className="px-6 py-3.5 font-medium">{t("moment")}</th>
              <th className="px-6 py-3.5 text-right font-medium">
                {t("shown")}
              </th>
              <th className="px-6 py-3.5 text-right font-medium">
                {t("clicked")}
              </th>
              <th className="px-6 py-3.5 text-right font-medium">
                {t("dismissed")}
              </th>
              <th className="px-6 py-3.5 text-right font-medium">
                {t("claimed")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {funnel.byMoment.map((row) => (
              <tr key={row.moment} className="hover:bg-gray-50/50">
                <td className="px-6 py-3.5 font-medium text-gray-900">
                  {getMomentLabel(row.moment)}
                </td>
                <td className="px-6 py-3.5 text-right text-gray-600">
                  {row.shownCount.toLocaleString()}
                </td>
                <td className="px-6 py-3.5 text-right text-gray-600">
                  {row.clickedCount.toLocaleString()}
                </td>
                <td className="px-6 py-3.5 text-right text-gray-600">
                  {row.dismissedCount.toLocaleString()}
                </td>
                <td className="px-6 py-3.5 text-right font-semibold text-gray-900">
                  {row.claimedCount.toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-100 bg-gray-50/80 font-bold text-gray-900">
              <td className="px-6 py-3.5">{t("total")}</td>
              <td className="px-6 py-3.5 text-right">
                {funnel.totals.shownCount.toLocaleString()}
              </td>
              <td className="px-6 py-3.5 text-right">
                {funnel.totals.clickedCount.toLocaleString()}
              </td>
              <td className="px-6 py-3.5 text-right">
                {funnel.totals.dismissedCount.toLocaleString()}
              </td>
              <td className="px-6 py-3.5 text-right text-emerald-700">
                {funnel.totals.claimedCount.toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
