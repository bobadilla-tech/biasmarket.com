"use client";

import { useMutation } from "@tanstack/react-query";
import { useUpdateDashboardStoreCache } from "@/features/stores";
import { settingsApi } from "../api/settings.api";
import type { VisibilityFormInput } from "../schemas/visibility.schema";

export function useSaveVisibility(storeId: string | undefined, slug: string) {
  const updateStoreCache = useUpdateDashboardStoreCache();

  return useMutation({
    mutationFn: (values: VisibilityFormInput) =>
      settingsApi.updateVisibility(storeId as string, values),
    onSuccess: (_data, values) => updateStoreCache(slug, values),
  });
}
