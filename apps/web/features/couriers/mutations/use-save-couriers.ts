"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { BulkSaveCouriersBodyDto } from "@biasmarket/types";
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

      for (const c of input.couriers) {
        courierSchema.parse(c);
      }

      const payload: BulkSaveCouriersBodyDto = {
        couriers: input.couriers.map((c) => ({
          id: isNewCourier(c.id) ? undefined : c.id,
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

      const rows = await apiClient.couriers.bulkSave(storeId, payload);
      return rows.map((r) => ({
        id: r.id,
        name: r.name,
        enabled: r.enabled,
        sortOrder: r.sortOrder,
        modalities: r.modalities.map((m) => ({
          id: m.id,
          modality: m.modality,
          price: Number(m.price),
          enabled: m.enabled,
        })),
      }));
    },
    onSuccess: () => {
      if (!storeId) return;
      queryClient.invalidateQueries({
        queryKey: couriersKeys.byStore(storeId),
      });
    },
  });
}
