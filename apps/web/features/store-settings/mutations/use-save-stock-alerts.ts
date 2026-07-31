"use client";

import { useMutation } from "@tanstack/react-query";
import { useUpdateDashboardStoreCache } from "@/features/stores";
import { settingsApi } from "../api/settings.api";
import type { StockAlertsFormInput } from "../schemas/stock-alerts.schema";

export function useSaveStockAlerts(storeId: string | undefined, slug: string) {
  const updateStoreCache = useUpdateDashboardStoreCache();

  return useMutation({
    mutationFn: (values: StockAlertsFormInput) =>
      settingsApi.updateStockAlerts(storeId as string, values),
    onSuccess: (_data, values) => updateStoreCache(slug, values),
  });
}
