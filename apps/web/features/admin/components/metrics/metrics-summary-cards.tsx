"use client";

import { useTranslations } from "next-intl";
import {
  ArrowUpRight,
  Bell,
  Clock,
  CreditCard,
  ExternalLink,
  PackageCheck,
  ShoppingBag,
  UserCheck,
} from "lucide-react";
import type { AdminAssistedOrderMetricsSummary } from "../../api/admin-metrics.api";

interface MetricsSummaryCardsProps {
  summary: AdminAssistedOrderMetricsSummary;
}

function formatPercent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function MetricsSummaryCards({ summary }: MetricsSummaryCardsProps) {
  const t = useTranslations("admin.metrics");
  const hasValidatedPayments = summary.ordersWithValidatedPaymentCount > 0;

  const cards = [
    {
      id: "orders-volume",
      title: t("cards.totalAssisted"),
      value: summary.totalAssistedOrders.toLocaleString(),
      subtitle: `${t("cards.totalMarketplace")}: ${summary.totalMarketplaceOrders.toLocaleString()}`,
      icon: ShoppingBag,
      iconColor: "text-blue-600 bg-blue-50",
    },
    {
      id: "link-opened",
      title: t("cards.linkOpenedRate"),
      value: formatPercent(summary.linkOpenedRate),
      subtitle: `${summary.linkOpenedCount} / ${summary.totalAssistedOrders}`,
      icon: ExternalLink,
      iconColor: "text-indigo-600 bg-indigo-50",
    },
    {
      id: "overall-claim",
      title: t("cards.overallClaimRate"),
      value: formatPercent(summary.overallClaimRate),
      subtitle: `${summary.totalClaimedCount} / ${summary.totalAssistedOrders}`,
      icon: UserCheck,
      iconColor: "text-purple-600 bg-purple-50",
    },
    {
      id: "validated-claim",
      title: t("cards.validatedClaimRate"),
      value: hasValidatedPayments
        ? formatPercent(summary.validatedClaimRate)
        : t("cards.notAvailable"),
      subtitle: `${summary.claimedWithValidatedPaymentCount} / ${summary.ordersWithValidatedPaymentCount}`,
      badge: t("cards.targetComparison"),
      icon: ArrowUpRight,
      iconColor: !hasValidatedPayments
        ? "text-gray-500 bg-gray-100"
        : summary.belowTargetClaimRate
          ? "text-amber-600 bg-amber-50"
          : "text-emerald-600 bg-emerald-50",
    },
    {
      id: "buyer-notice",
      title: t("cards.buyerNoticeRate"),
      value: formatPercent(summary.buyerNoticeRate),
      subtitle: `${summary.buyerNoticeCount} / ${summary.totalAssistedOrders}`,
      icon: Bell,
      iconColor: "text-sky-600 bg-sky-50",
    },
    {
      id: "confirmed-reception",
      title: t("cards.confirmedReceivedRate"),
      value: formatPercent(summary.confirmedReceivedRate),
      subtitle: `${summary.confirmedReceivedCount} / ${summary.totalAssistedOrders}`,
      icon: PackageCheck,
      iconColor: "text-teal-600 bg-teal-50",
    },
    {
      id: "time-to-payment",
      title: t("cards.timeToPayment"),
      value:
        summary.timeToFirstValidPayment.assistedMedianMinutes != null
          ? t("cards.medianMinutes", {
              minutes: summary.timeToFirstValidPayment.assistedMedianMinutes,
            })
          : t("cards.notAvailable"),
      subtitle: `${t("cards.avgMinutes", {
        minutes:
          summary.timeToFirstValidPayment.assistedAvgMinutes ??
          t("cards.notAvailable"),
      })} · ${t("cards.marketplaceAvgMinutes", {
        minutes:
          summary.timeToFirstValidPayment.marketplaceAvgMinutes ??
          t("cards.notAvailable"),
      })}`,
      icon: Clock,
      iconColor: "text-amber-600 bg-amber-50",
    },
    {
      id: "payment-sources",
      title: t("cards.paymentSources"),
      value: formatPercent(summary.paymentSources.sellerRecordedRate),
      subtitle: `${t("cards.sellerRecorded")}: ${formatPercent(
        summary.paymentSources.sellerRecordedRate,
      )} (${summary.paymentSources.sellerRecordedCount}) · ${t(
        "cards.buyerSubmitted",
      )}: ${formatPercent(summary.paymentSources.buyerSubmittedRate)} (${
        summary.paymentSources.buyerSubmittedCount
      })`,
      icon: CreditCard,
      iconColor: "text-rose-600 bg-rose-50",
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((card) => {
        const Icon = card.icon;
        return (
          <div
            key={card.id}
            data-testid={`card-${card.id}`}
            className="flex flex-col justify-between rounded-2xl border border-gray-100 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-gray-500">
                {card.title}
              </span>
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${card.iconColor}`}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
              </div>
            </div>

            <div className="mt-4 flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-2xl font-bold tracking-tight text-gray-900">
                  {card.value}
                </span>
                {card.badge && (
                  <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                    {card.badge}
                  </span>
                )}
              </div>
              <span className="text-xs text-gray-500">{card.subtitle}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
