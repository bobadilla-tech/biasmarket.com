"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function SingleSeriesBarChart({
  title,
  data,
  dataKey,
  valueFormatter,
  color = "var(--store-primary)",
}: {
  title: string;
  data: { label: string; value: number }[];
  dataKey?: string;
  valueFormatter?: (value: number) => string;
  color?: string;
}) {
  const minWidth = Math.max(data.length * 32, 320);

  return (
    <Card className="rounded-[26px] border-[#eadcf8] bg-white py-0 shadow-sm">
      <CardHeader className="px-5 pt-5">
        <CardTitle className="text-base font-semibold text-[#2d1649]">{title}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto px-5 pb-5">
        <div style={{ minWidth }}>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#f0e7f8" />
              <XAxis
                dataKey="label"
                tickLine={false}
                axisLine={false}
                tick={{ fill: "#927fac", fontSize: 11 }}
              />
              <YAxis tickLine={false} axisLine={false} tick={{ fill: "#927fac", fontSize: 11 }} width={40} />
              <Tooltip
                formatter={(value) =>
                  valueFormatter && typeof value === "number" ? valueFormatter(value) : value
                }
                contentStyle={{ borderRadius: 12, borderColor: "#eadcf8" }}
              />
              <Bar dataKey={dataKey ?? "value"} fill={color} radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
