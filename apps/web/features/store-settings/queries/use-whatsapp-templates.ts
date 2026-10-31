"use client";

import { useQuery } from "@tanstack/react-query";
import { settingsApi } from "../api/settings.api";
import type { WhatsAppTemplateResponseDto } from "@biasmarket/types";

export const whatsappTemplatesKeys = {
  byStore: (storeId: string) => ["whatsapp-templates", storeId] as const,
};

// Every message-type override for a store; a type with no override row is
// null (callers fall back to the hardcoded default template).
export interface WhatsAppTemplatesByStore {
  newOrder: WhatsAppTemplateResponseDto | null;
  paymentReminder: WhatsAppTemplateResponseDto | null;
  assistedOrderLink: WhatsAppTemplateResponseDto | null;
  paymentValidated: WhatsAppTemplateResponseDto | null;
  inTransit: WhatsAppTemplateResponseDto | null;
  ready: WhatsAppTemplateResponseDto | null;
  delivered: WhatsAppTemplateResponseDto | null;
}

export function useWhatsAppTemplates(storeId: string | undefined) {
  return useQuery({
    queryKey: whatsappTemplatesKeys.byStore(storeId ?? ""),
    queryFn: () => settingsApi.getWhatsAppTemplates(storeId as string),
    enabled: !!storeId,
  });
}
