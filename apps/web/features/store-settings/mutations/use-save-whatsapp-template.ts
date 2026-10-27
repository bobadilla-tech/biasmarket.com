"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { WhatsAppMessageType } from "@biasmarket/utils/whatsapp";
import { settingsApi } from "../api/settings.api";
import { whatsappTemplatesKeys } from "../queries/use-whatsapp-templates";

const TEMPLATE_KEY = {
  NEW_ORDER: "newOrder",
  PAYMENT_REMINDER: "paymentReminder",
  ASSISTED_ORDER_LINK: "assistedOrderLink",
} as const satisfies Record<WhatsAppMessageType, string>;

export function useSaveWhatsAppTemplate(
  storeId: string | undefined,
  type: WhatsAppMessageType,
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (template: string) =>
      settingsApi.saveWhatsAppTemplate(storeId as string, type, template),
    onSuccess: (saved) => {
      const key = whatsappTemplatesKeys.byStore(storeId as string);
      queryClient.setQueryData<
        Record<(typeof TEMPLATE_KEY)[WhatsAppMessageType], unknown> | undefined
      >(key, (current) => {
        if (!current) return current;
        return {
          ...current,
          [TEMPLATE_KEY[type]]: saved,
        };
      });
    },
  });
}
