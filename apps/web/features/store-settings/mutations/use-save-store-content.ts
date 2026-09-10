"use client";

import { useMutation } from "@tanstack/react-query";
import { useUpdateDashboardStoreCache } from "@/features/stores";
import { settingsApi } from "../api/settings.api";
import type { StoreContentFormInput } from "../schemas/store-content.schema";

export function useSaveStoreContent(storeId: string | undefined, slug: string) {
  const updateStoreCache = useUpdateDashboardStoreCache();

  return useMutation({
    mutationFn: (values: StoreContentFormInput) =>
      settingsApi.updateStoreContent(storeId as string, values),
    onSuccess: (_data, values) => updateStoreCache(slug, values),
  });
}
