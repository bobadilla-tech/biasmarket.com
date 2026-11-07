"use client";

import { useTranslations } from "next-intl";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import type { AdminAssistedOrderMetricsSummary } from "../../api/admin-metrics.api";

interface HypothesisCalloutProps {
  summary: AdminAssistedOrderMetricsSummary;
}

export function HypothesisCallout({ summary }: HypothesisCalloutProps) {
  const t = useTranslations("admin.metrics.hypothesis");
  const hasValidatedPayments = summary.ordersWithValidatedPaymentCount > 0;
  const isBelowTarget = hasValidatedPayments && summary.belowTargetClaimRate;
  const isOnTarget = hasValidatedPayments && !summary.belowTargetClaimRate;
  const currentRatePercent = (summary.validatedClaimRate * 100).toFixed(1);

  return (
    <div
      data-testid="hypothesis-callout"
      className={`rounded-2xl border p-5 shadow-sm transition-colors ${
        isBelowTarget
          ? "border-amber-200 bg-amber-50/70 text-amber-950"
          : isOnTarget
            ? "border-emerald-200 bg-emerald-50/60 text-emerald-950"
            : "border-gray-200 bg-gray-50 text-gray-800"
      }`}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div
            className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
              isBelowTarget
                ? "bg-amber-100 text-amber-700"
                : isOnTarget
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-gray-100 text-gray-600"
            }`}
          >
            {isBelowTarget ? (
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            ) : isOnTarget ? (
              <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Info className="h-5 w-5" aria-hidden="true" />
            )}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-semibold leading-snug">
                {t("title")}
              </h2>
              <span
                data-testid="hypothesis-status-badge"
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  isBelowTarget
                    ? "bg-amber-200 text-amber-900"
                    : isOnTarget
                      ? "bg-emerald-200 text-emerald-900"
                      : "bg-gray-200 text-gray-700"
                }`}
              >
                {isBelowTarget
                  ? t("belowTarget")
                  : isOnTarget
                    ? t("onTarget")
                    : t("noData")}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-gray-700 leading-relaxed sm:text-sm">
              {t("description")}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-start rounded-xl border border-black/5 bg-white/70 px-4 py-2.5 sm:items-end">
          <span className="text-[11px] font-medium text-gray-500 uppercase tracking-wider">
            {t("currentRate")}
          </span>
          <span className="text-lg font-bold text-gray-900">
            {hasValidatedPayments ? `${currentRatePercent}%` : "—"}{" "}
            <span className="text-xs font-normal text-gray-500">
              {t("target", { percent: 30 })}
            </span>
          </span>
        </div>
      </div>

      {isBelowTarget && (
        <div
          data-testid="hypothesis-evaluation-alert"
          className="mt-4 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-100/80 px-3.5 py-2.5 text-xs font-medium text-amber-900"
        >
          <Info
            className="h-4 w-4 shrink-0 text-amber-700"
            aria-hidden="true"
          />
          <span>{t("evaluationAlert")}</span>
        </div>
      )}
    </div>
  );
}
