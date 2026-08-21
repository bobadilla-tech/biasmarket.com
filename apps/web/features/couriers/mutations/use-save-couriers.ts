"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { couriersApi, type CreateCourierInput } from "../api/couriers.api";
import { couriersKeys } from "../queries/use-couriers";
import type { Courier, CourierModality } from "../schemas/courier.schema";
import { isNewCourier } from "../schemas/courier.schema";

export function useSaveCouriers(storeId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: {
      couriers: Courier[];
      deletedIds: string[];
    }) => {
      if (!storeId) throw new Error("Store ID requerido");

      // Delete removed couriers
      await Promise.all(
        input.deletedIds.map((id) => couriersApi.remove(storeId, id)),
      );

      // Update existing couriers (name, enabled, modalities)
      const updates = input.couriers
        .filter((c) => !isNewCourier(c.id))
        .map((c) =>
          couriersApi.update(storeId, c.id, {
            name: c.name,
            enabled: c.enabled,
            sortOrder: c.sortOrder,
            modalities: c.modalities.map((m) => ({
              modality: m.modality,
              price: m.price,
              enabled: m.enabled,
            })),
          }),
        );

      // Create new couriers
      const creates = input.couriers
        .filter((c) => isNewCourier(c.id))
        .map((c) =>
          couriersApi.create(storeId, {
            name: c.name,
            enabled: c.enabled,
            sortOrder: c.sortOrder,
            modalities: c.modalities.map((m) => ({
              modality: m.modality,
              price: m.price,
              enabled: m.enabled,
            })),
          }),
        );

      await Promise.all([...updates, ...creates]);
    },
    onSuccess: () => {
      if (!storeId) return;
      queryClient.invalidateQueries({
        queryKey: couriersKeys.byStore(storeId),
      });
    },
  });
}
