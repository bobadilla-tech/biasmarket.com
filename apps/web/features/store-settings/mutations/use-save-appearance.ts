"use client";

import { useMutation } from "@tanstack/react-query";
import { useUpdateDashboardStoreCache } from "@/features/stores";
import type { StoreThemeConfig } from "@/lib/store-theme";
import { settingsApi } from "../api/settings.api";

export function useSaveAppearance(storeId: string | undefined, slug: string) {
  const updateStoreCache = useUpdateDashboardStoreCache();

  return useMutation({
    mutationFn: (themeConfig: StoreThemeConfig) =>
      settingsApi.updateAppearance(storeId as string, themeConfig),
    onSuccess: (_data, themeConfig) => updateStoreCache(slug, { themeConfig }),
  });
}
