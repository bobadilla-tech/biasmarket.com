import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@biasmarket/types";
import type { PublicOrderResponseDto } from "@biasmarket/types";
import { apiClient } from "@/lib/api-client";

export const publicOrderKeys = {
  detail: (token: string) => ["public-order", token] as const,
};

// Thrown when the token is valid but belongs to a different store than the URL
// slug. A UX guard, not access control: the browser already received the JSON.
export class InvalidOrderLinkError extends Error {
  constructor() {
    super("invalid order link");
    this.name = "InvalidOrderLinkError";
  }
}

export type PublicOrderErrorKind = "invalid" | "rateLimited" | "error";

// Classify by status only, never by message. 404 covers unknown, revoked and
// rotated tokens (the API cannot tell them apart on purpose); a 500 from a
// failed first-open stamp or a network error is a retryable `error`, not an
// "invalid link".
export function classifyPublicOrderError(error: unknown): PublicOrderErrorKind {
  if (error instanceof InvalidOrderLinkError) return "invalid";
  if (error instanceof ApiError) {
    if (error.status === 404) return "invalid";
    if (error.status === 429) return "rateLimited";
  }
  return "error";
}

function sameSlug(urlSlug: string, orderSlug: string): boolean {
  try {
    return (
      decodeURIComponent(urlSlug).toLowerCase() === orderSlug.toLowerCase()
    );
  } catch {
    // A malformed `%` sequence throws URIError: treat it as a mismatch.
    return false;
  }
}

// `gcTime: 0` + no persistence: the order never outlives the page. Render
// `isError` before `data` — React Query keeps the previous data when a refetch
// fails, so a tab left open would otherwise keep showing an order whose link
// the seller has since rotated.
export function usePublicOrder(slug: string, token: string) {
  return useQuery<PublicOrderResponseDto>({
    queryKey: publicOrderKeys.detail(token),
    queryFn: async () => {
      const order = await apiClient.publicOrders.getByToken(token);
      if (!sameSlug(slug, order.store.slug)) throw new InvalidOrderLinkError();
      return order;
    },
    retry: false,
    staleTime: 30_000,
    gcTime: 0,
    refetchOnWindowFocus: true,
  });
}
