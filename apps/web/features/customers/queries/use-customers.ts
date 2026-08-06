"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export const customersKeys = {
  byStore: (storeId: string) => ["customers", storeId] as const,
  detail: (storeId: string, customerId: string) =>
    ["customers", storeId, customerId] as const,
};

export function useCustomers(
  storeId: string | undefined,
  fallbackErrorMessage?: string,
) {
  return useQuery({
    queryKey: customersKeys.byStore(storeId as string),
    queryFn: () =>
      apiClient.customers.findAll(storeId as string, { fallbackErrorMessage }),
    enabled: !!storeId,
  });
}

export function useCustomer(
  storeId: string | undefined,
  customerId: string | null,
  fallbackErrorMessage?: string,
) {
  return useQuery({
    queryKey: customersKeys.detail(storeId as string, customerId as string),
    queryFn: () =>
      apiClient.customers.findOne(storeId as string, customerId as string, {
        fallbackErrorMessage,
      }),
    enabled: !!storeId && !!customerId,
  });
}
