"use client";

import { useMutation } from "@tanstack/react-query";
import { storesApi, useUpdateDashboardStoreCache } from "@/features/stores";

export function useUploadStoreLogo(storeId: string | undefined, slug: string, fallbackErrorMessage?: string) {
  const updateStoreCache = useUpdateDashboardStoreCache();

  return useMutation({
    mutationFn: async (file: File) => {
      const store = await storesApi.uploadLogo(storeId as string, file, fallbackErrorMessage);
      return store.logoUrl ?? null;
    },
    onSuccess: (logoUrl) => updateStoreCache(slug, { logoUrl }),
  });
}
