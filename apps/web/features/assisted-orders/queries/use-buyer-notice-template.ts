"use client";

import { useQuery } from "@tanstack/react-query";
import type { WhatsAppBuyerNoticeType } from "@biasmarket/utils/whatsapp";
import { apiClient } from "@/lib/api-client";

// The seller's saved override for one notice, or null when they never
// customized it (the default message is used then).
export function useBuyerNoticeTemplate(
  storeId: string | undefined,
  notice: WhatsAppBuyerNoticeType | undefined,
) {
  return useQuery({
    queryKey: ["buyer-notice-template", storeId, notice] as const,
    queryFn: async () => {
      const row = await apiClient.whatsappTemplates.findOne(
        storeId as string,
        notice as WhatsAppBuyerNoticeType,
      );
      return row?.template ?? null;
    },
    enabled: !!storeId && !!notice,
    retry: 1,
  });
}
