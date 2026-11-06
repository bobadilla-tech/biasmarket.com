"use client";

import type { AdminAssistedOrderMetricsResponse } from "../../api/admin-metrics.api";
import { MetricsSummaryCards } from "./metrics-summary-cards";
import { HypothesisCallout } from "./hypothesis-callout";
import { InvitationFunnelCard } from "./invitation-funnel-card";
import { WeeklyStoreBreakdownTable } from "./weekly-store-breakdown-table";

interface AdminMetricsViewProps {
  data: AdminAssistedOrderMetricsResponse;
}

export function AdminMetricsView({ data }: AdminMetricsViewProps) {
  return (
    <div className="flex flex-col gap-8">
      {/* 30% Claim Rate Hypothesis Callout */}
      <HypothesisCallout summary={data.summary} />

      {/* Summary KPI Cards */}
      <MetricsSummaryCards summary={data.summary} />

      {/* Save-Order Invitation Funnel */}
      <InvitationFunnelCard funnel={data.invitationFunnel} />

      {/* Weekly Store Breakdown Table */}
      <WeeklyStoreBreakdownTable breakdown={data.weeklyStoreBreakdown} />
    </div>
  );
}
