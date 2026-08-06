"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Calendar, CreditCard, Wallet } from "lucide-react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/shared/empty-state";
import { ErrorState } from "@/components/shared/error-state";
import { LoadingState } from "@/components/shared/loading-state";
import { StatTile } from "./stat-tile";
import {
  type PaymentRangePreset,
  paymentRangePresetValues,
  resolvePaymentRange,
} from "../lib/payment-date-ranges";
import { usePaymentMethodsBreakdown } from "../queries/use-payment-methods-breakdown";
import type { PaymentMethodValue } from "../schemas/payment-methods.schema";

const METHOD_COLORS: Record<PaymentMethodValue, string> = {
  YAPE: "#159a63",
  PLIN: "#6d28d9",
  TRANSFER: "#2563eb",
  CASH: "#d97706",
};

const UNKNOWN_COLOR = "#8f7da8";

function methodColor(method: PaymentMethodValue | null): string {
  return method ? METHOD_COLORS[method] : UNKNOWN_COLOR;
}

function dateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatPeriod(
  fromIso: string,
  toIso: string,
  locale: string,
): string {
  const from = new Date(fromIso);
  const to = new Date(toIso);
  const formatter = new Intl.DateTimeFormat(locale, {
    month: "short",
    day: "numeric",
  });
  return `${formatter.format(from)} – ${formatter.format(to)}`;
}

export function PaymentMethodsBreakdown({
  storeId,
  currency,
}: {
  storeId: string | undefined;
  currency: string;
}) {
  const t = useTranslations("dashboard.payments");
  const tOrders = useTranslations("dashboard.orders");
  const { locale } = useParams<{ locale: string }>();

  const today = new Date();
  const [preset, setPreset] = useState<PaymentRangePreset>("month");
  const [customFrom, setCustomFrom] = useState(
    () => dateInputValue(new Date(today.getFullYear(), today.getMonth(), 1)),
  );
  const [customTo, setCustomTo] = useState(() => dateInputValue(today));

  const range = useMemo(
    () => resolvePaymentRange(preset, { from: customFrom, to: customTo }),
    [preset, customFrom, customTo],
  );
  const { breakdown, loading, error } = usePaymentMethodsBreakdown(
    storeId,
    range,
  );

  const rows = useMemo(
    () =>
      (breakdown?.byMethod ?? [])
        .slice()
        .sort((a, b) => b.amount - a.amount),
    [breakdown],
  );
  const chartData = rows.filter((row) => row.amount > 0);
  const labelFor = (method: PaymentMethodValue | null) =>
    method
      ? tOrders(`paymentMethodLabels.${method}`)
      : t("unknownMethod");

  const presetLabels: Record<PaymentRangePreset, string> = {
    today: t("range.today"),
    week: t("range.week"),
    month: t("range.month"),
    custom: t("range.custom"),
  };

  return (
    <Card className="rounded-[30px] border-[#eadcf8] bg-white shadow-sm">
      <div className="flex flex-col gap-4 px-6 pt-6 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#2d1649]">
            {t("breakdownTitle")}
          </h2>
          <p className="mt-0.5 text-sm text-[#8f7da8]">
            {t("breakdownSubtitle")}
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 sm:items-end">
          <div className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-[#eadcf7] bg-white p-1">
            {paymentRangePresetValues.map((value) => (
              <Button
                key={value}
                type="button"
                variant="ghost"
                onClick={() => setPreset(value)}
                className={cn(
                  "h-9 rounded-2xl px-4 text-sm font-semibold",
                  preset === value
                    ? "store-theme-primary-button"
                    : "text-[#8f7da8] hover:bg-[#fcf9ff] hover:text-[#2d1649]",
                )}
              >
                {presetLabels[value]}
              </Button>
            ))}
          </div>
          {preset === "custom" && (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                aria-label={t("customFrom")}
                className="rounded-lg border border-[#eadcf7] px-3 py-1.5 text-sm text-[#2d1649] outline-none focus:border-[var(--store-primary)]"
              />
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                aria-label={t("customTo")}
                className="rounded-lg border border-[#eadcf7] px-3 py-1.5 text-sm text-[#2d1649] outline-none focus:border-[var(--store-primary)]"
              />
            </div>
          )}
        </div>
      </div>

      <CardContent className="flex flex-col gap-6 px-6 pb-6 pt-5">
        {loading ? (
          <LoadingState variant="inline" rows={4} />
        ) : error || !breakdown ? (
          <ErrorState message={error ?? t("loadError")} />
        ) : breakdown.totalCount === 0 ? (
          <EmptyState icon={Wallet} message={t("noData")} />
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <StatTile
                icon={Wallet}
                label={t("summary.totalReceived")}
                value={`${currency} ${breakdown.totalAmount.toFixed(2)}`}
              />
              <StatTile
                icon={CreditCard}
                label={t("summary.totalPayments")}
                value={String(breakdown.totalCount)}
              />
              <StatTile
                icon={Calendar}
                label={t("summary.period")}
                value={formatPeriod(breakdown.from, breakdown.to, locale)}
              />
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="flex min-h-[260px] items-center justify-center rounded-2xl border border-[#f0e7f8] bg-white p-4">
                {chartData.length === 0 ? (
                  <p className="text-sm text-[#8f7da8]">{t("noData")}</p>
                ) : (
                  <ResponsiveContainer width="100%" height={240}>
                    <PieChart>
                      <Pie
                        data={chartData}
                        dataKey="amount"
                        nameKey="method"
                        innerRadius={68}
                        outerRadius={92}
                        paddingAngle={2}
                        strokeWidth={0}
                      >
                        {chartData.map((row) => (
                          <Cell
                            key={row.method ?? "unknown"}
                            fill={methodColor(row.method)}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, name) => [
                          `${currency} ${Number(value).toFixed(2)}`,
                          labelFor(name as PaymentMethodValue | null),
                        ]}
                        contentStyle={{
                          borderRadius: 12,
                          borderColor: "#eadcf8",
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>

              <div className="rounded-2xl border border-[#f0e7f8] bg-white p-4">
                <ul className="divide-y divide-[#f3ebff]">
                  {rows.map((row) => (
                    <li
                      key={row.method ?? "unknown"}
                      className="flex items-center justify-between gap-4 py-3"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <span
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: methodColor(row.method) }}
                        />
                        <span className="truncate text-sm font-medium text-[#2d1649]">
                          {labelFor(row.method)}
                        </span>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-semibold text-[#2d1649]">
                          {currency} {row.amount.toFixed(2)}
                        </p>
                        <p className="text-xs text-[#8f7da8]">
                          {row.percentage.toFixed(1)}% ·{" "}
                          {t("transactions", { count: row.count })}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
