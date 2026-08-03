"use client";

import { useQuery } from "@tanstack/react-query";
import { customersApi } from "../api/customers.api";

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
    queryFn: () => customersApi.list(storeId as string, fallbackErrorMessage),
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
      customersApi.getOne(
        storeId as string,
        customerId as string,
        fallbackErrorMessage,
      ),
    enabled: !!storeId && !!customerId,
  });
}
