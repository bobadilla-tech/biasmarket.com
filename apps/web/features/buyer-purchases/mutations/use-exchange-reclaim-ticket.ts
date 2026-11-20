import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export function useExchangeReclaimTicket() {
  return useMutation({
    mutationFn: (ticket: string) =>
      apiClient.publicOrders.exchangeReclaimTicket({ ticket }),
  });
}
