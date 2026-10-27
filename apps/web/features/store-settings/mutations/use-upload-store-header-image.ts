"use client";

import { useMutation } from "@tanstack/react-query";
import { useUpdateDashboardStoreCache } from "@/features/stores";
import { settingsApi } from "../api/settings.api";

export function useUploadStoreHeaderImage(
  storeId: string | undefined,
  slug: string,
  kind: "banner" | "public-owner-avatar",
  fallbackErrorMessage?: string,
) {
  const updateStoreCache = useUpdateDashboardStoreCache();
  return useMutation({
    mutationFn: (file: File) =>
      settingsApi.uploadHeaderImage(
        storeId as string,
        kind,
        file,
        fallbackErrorMessage,
      ),
    onSuccess: (data) => updateStoreCache(slug, data),
  });
}
