// @biasmarket/query — shared React Query client defaults for web + mobile.
// Keeps web and mobile from drifting on cache/freshness configuration.
import { QueryClient } from "@tanstack/react-query";

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
      },
    },
  });
}
