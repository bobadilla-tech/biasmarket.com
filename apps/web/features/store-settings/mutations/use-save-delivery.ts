"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { settingsApi } from "../api/settings.api";
import { deliverySettingsKeys } from "../queries/use-delivery-settings";
import type { PickupPoint } from "../schemas/delivery.schema";

export function useSaveDelivery(storeId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: {
      pickupEnabled: boolean;
      courierEnabled: boolean;
      courierCost: number;
      points: PickupPoint[];
      deletedPointIds: string[];
    }) => settingsApi.saveDeliverySettings(storeId as string, input),
    onSuccess: () => {
      if (!storeId) return;
      queryClient.invalidateQueries({
        queryKey: deliverySettingsKeys.byStore(storeId),
      });
    },
  });
}
