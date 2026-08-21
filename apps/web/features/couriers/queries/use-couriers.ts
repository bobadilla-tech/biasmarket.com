"use client";

import { useQuery } from "@tanstack/react-query";
import { couriersApi } from "../api/couriers.api";

export const couriersKeys = {
  byStore: (storeId: string) => ["couriers", storeId] as const,
};

export function useCouriers(storeId: string | undefined) {
  return useQuery({
    queryKey: couriersKeys.byStore(storeId ?? ""),
    queryFn: () => couriersApi.findAll(storeId as string),
    enabled: !!storeId,
  });
}
