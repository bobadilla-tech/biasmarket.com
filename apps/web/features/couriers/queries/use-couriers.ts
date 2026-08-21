"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import type { Courier } from "../schemas/courier.schema";

export const couriersKeys = {
  byStore: (storeId: string) => ["couriers", storeId] as const,
};

export function useCouriers(storeId: string | undefined) {
  return useQuery({
    queryKey: couriersKeys.byStore(storeId ?? ""),
    queryFn: async (): Promise<Courier[]> => {
      const rows = await apiClient.couriers.findAll(storeId as string);
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
    enabled: !!storeId,
  });
}
