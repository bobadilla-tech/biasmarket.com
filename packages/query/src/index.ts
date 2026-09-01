import { QueryClient } from "@tanstack/react-query";

/**
 * Shared QueryClient defaults for every Bias Market client (web + mobile).
 * Web and mobile must not drift on data-freshness behavior, so the config
 * lives here instead of inline in each app's QueryClientProvider.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
      },
    },
  });
}