"use client";

import { useQuery } from "@tanstack/react-query";
import { settingsApi } from "../api/settings.api";

export const deliverySettingsKeys = {
  byStore: (storeId: string) => ["delivery-settings", storeId] as const,
};

export function useDeliverySettings(storeId: string | undefined) {
  return useQuery({
    queryKey: deliverySettingsKeys.byStore(storeId ?? ""),
    queryFn: () => settingsApi.getDeliverySettings(storeId as string),
    enabled: !!storeId,
  });
}
