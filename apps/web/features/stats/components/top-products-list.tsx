"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import type { AnalyticsTopProduct } from "../schemas/analytics.schema";

export function TopProductsList({ products }: { products: AnalyticsTopProduct[] }) {
  const t = useTranslations("dashboard.analytics");
  const maxUnits = Math.max(...products.map((p) => p.unitsSold), 1);

  return (
    <Card className="rounded-[26px] border-[#eadcf8] bg-white py-0 shadow-sm">
      <CardHeader className="px-5 pt-5">
        <CardTitle className="text-base font-semibold text-[#2d1649]">{t("topProductsTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="px-5 pb-5">
        {products.length === 0 ? (
          <EmptyState message={t("topProductsEmpty")} />
        ) : (
          <ul className="space-y-3">
            {products.map((product, index) => (
              <li key={product.productId} className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="truncate font-medium text-[#2d1649]">
                    {index + 1}. {product.name}
                  </span>
                  <span className="shrink-0 font-semibold text-[#8f7da8]">
                    {t("unitsSold", { count: product.unitsSold })}
                  </span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-[#f0e7f8]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${(product.unitsSold / maxUnits) * 100}%`,
                      background: "linear-gradient(90deg, var(--store-accent) 0%, var(--store-primary) 100%)",
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
