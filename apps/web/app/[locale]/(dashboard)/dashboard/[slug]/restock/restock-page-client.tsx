"use client";

import { useTranslations } from "next-intl";
import { useDashboardStore } from "@/features/stores";
import { RestockRequestsPanel } from "@/features/restock";

export function RestockPageClient() {
  const t = useTranslations("dashboard.restock");
  const tCommon = useTranslations("common");
  const { storeId, loading: storeLoading } = useDashboardStore();

  if (storeLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-sm text-[#8f7da8]">
        {tCommon("loading")}
      </div>
    );
  }

  return (
    <div className="min-h-screen px-5 py-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-3xl font-bold tracking-tight text-[#2d1649]">
          {t("title")}
        </h1>
        <RestockRequestsPanel
          storeId={storeId}
          errorMessage={tCommon("networkError")}
        />
      </div>
    </div>
  );
}
