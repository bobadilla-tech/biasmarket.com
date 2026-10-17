import { useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export type ClaimMoment =
  "entrega" | "pago_validado" | "banner" | "adelanto_linea_de_tiempo";

// Browser-side only: it must set the ticket cookie on the API host, which a
// server call (INTERNAL_API_URL) never would. The SDK sends credentials by
// default (packages/types/http.ts).
export function useClaimOrder(token: string) {
  return useMutation({
    mutationFn: (moment?: ClaimMoment) =>
      apiClient.publicOrders.claimTicket(token, moment ? { moment } : {}),
  });
}
