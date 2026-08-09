"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "../api/settings.api";
import { whatsappTemplatesKeys } from "../queries/use-whatsapp-templates";

export function useSaveWhatsAppTemplate(
  storeId: string | undefined,
  type: "NEW_ORDER" | "PAYMENT_REMINDER",
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (template: string) =>
      settingsApi.saveWhatsAppTemplate(storeId as string, type, template),
    onSuccess: (saved) => {
      const key = whatsappTemplatesKeys.byStore(storeId as string);
      queryClient.setQueryData<{
        newOrder: unknown;
        paymentReminder: unknown;
      } | undefined>(key, (current) => {
        if (!current) return current;
        return {
          ...current,
          [type === "NEW_ORDER" ? "newOrder" : "paymentReminder"]: saved,
        };
      });
    },
  });
}
