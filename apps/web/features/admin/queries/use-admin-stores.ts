"use client";

import { useQuery } from "@tanstack/react-query";
import { adminStoresApi } from "../api/admin-stores.api";

export const adminStoresKeys = {
  all: ["admin-stores"] as const,
};

export function useAdminStores(fallbackErrorMessage?: string) {
  return useQuery({
    queryKey: adminStoresKeys.all,
    queryFn: () => adminStoresApi.list(fallbackErrorMessage),
  });
}
