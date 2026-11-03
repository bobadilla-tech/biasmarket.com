"use client";

import { useMutation } from "@tanstack/react-query";
import { useUpdateDashboardStoreCache } from "@/features/stores";
import { settingsApi } from "../api/settings.api";

export function useSavePaymentInstructions(
  storeId: string | undefined,
  slug: string,
) {
  const updateStoreCache = useUpdateDashboardStoreCache();

  return useMutation({
    mutationFn: (paymentInstructions: string) =>
      settingsApi.updatePaymentInstructions(
        storeId as string,
        paymentInstructions,
      ),
    onSuccess: (data) => updateStoreCache(slug, data),
  });
}
