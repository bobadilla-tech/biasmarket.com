"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export const assistedLinkTemplateKeys = {
  byStore: (storeId: string) =>
    ["assisted-order-link-template", storeId] as const,
};

// The seller's saved ASSISTED_ORDER_LINK override, or null when they never
// customized it (the default message is used then).
export function useAssistedLinkTemplate(storeId: string | undefined) {
  return useQuery({
    queryKey: assistedLinkTemplateKeys.byStore(storeId ?? ""),
    queryFn: async () => {
      const row = await apiClient.whatsappTemplates.findOne(
        storeId as string,
        "ASSISTED_ORDER_LINK",
      );
      return row?.template ?? null;
    },
    enabled: !!storeId,
  });
}
