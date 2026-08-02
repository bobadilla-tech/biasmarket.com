"use client";

import { useTranslations } from "next-intl";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const NEW_COLOR = "#159a63";
const RETURNING_COLOR = "var(--store-primary)";

export function NewVsReturningChart({
  data,
}: {
  data: { label: string; newCustomers: number; returningCustomers: number }[];
}) {
  const t = useTranslations("dashboard.analytics");
  const minWidth = Math.max(data.length * 32, 320);

  return (
    <Card className="rounded-[26px] border-[#eadcf8] bg-white py-0 shadow-sm">
      <CardHeader className="px-5 pt-5">
        <CardTitle className="text-base font-semibold text-[#2d1649]">
          {t("newVsReturningTitle")}
        </CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto px-5 pb-5">
        <div style={{ minWidth }}>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#f0e7f8" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#927fac", fontSize: 11 }}
              />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: "#927fac", fontSize: 11 }} width={40} />
              <Tooltip contentStyle={{ borderRadius: 12, borderColor: "#eadcf8" }} />
              <Legend
                formatter={(value) => (
                  <span className="text-xs text-[#8f7da8]">
                    {value === "newCustomers" ? t("newCustomers") : t("returningCustomers")}
                  </span>
                )}
              />
              <Bar dataKey="newCustomers" stackId="customers" fill={NEW_COLOR} radius={[0, 0, 0, 0]} />
              <Bar
                dataKey="returningCustomers"
                stackId="customers"
                fill={RETURNING_COLOR}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
