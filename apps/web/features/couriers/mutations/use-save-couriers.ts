"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { couriersApi, type CreateCourierInput } from "../api/couriers.api";
import { couriersKeys } from "../queries/use-couriers";
import type { Courier } from "../schemas/courier.schema";
import { courierSchema, isNewCourier } from "../schemas/courier.schema";

export function useSaveCouriers(storeId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      couriers: Courier[];
      deletedIds: string[];
    }) => {
      if (!storeId) throw new Error("Store ID requerido");

      // Validate all couriers before sending
      for (const c of input.couriers) {
        courierSchema.parse(c);
      }

      const payload: {
        couriers: CreateCourierInput[];
        deletedIds: string[];
      } = {
        couriers: input.couriers.map((c) => ({
          name: c.name,
          enabled: c.enabled,
          sortOrder: c.sortOrder,
          modalities: c.modalities.map((m) => ({
            modality: m.modality,
            price: m.price,
            enabled: m.enabled,
          })),
        })),
        deletedIds: input.deletedIds,
      };

      return couriersApi.bulkSave(storeId, payload);
    },
    onSuccess: () => {
      if (!storeId) return;
      queryClient.invalidateQueries({
        queryKey: couriersKeys.byStore(storeId),
      });
    },
  });
}
