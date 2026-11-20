import { beforeEach, expect, test, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const { exchangeReclaimTicket } = vi.hoisted(() => ({
  exchangeReclaimTicket: vi.fn(),
}));

vi.mock("@/lib/api-client", () => ({
  apiClient: { publicOrders: { exchangeReclaimTicket } },
}));

const { useExchangeReclaimTicket } =
  await import("./use-exchange-reclaim-ticket");

const queryClient = new QueryClient();
function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  queryClient.clear();
  vi.clearAllMocks();
});

test("exchanges a reclaim ticket through the generated public API client", async () => {
  exchangeReclaimTicket.mockResolvedValue(undefined);
  const { result } = renderHook(() => useExchangeReclaimTicket(), { wrapper });

  result.current.mutate("signed.ticket");

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(exchangeReclaimTicket).toHaveBeenCalledWith({
    ticket: "signed.ticket",
  });
});

test("exposes an exchange failure to the reclaim page", async () => {
  exchangeReclaimTicket.mockRejectedValue(new Error("expired"));
  const { result } = renderHook(() => useExchangeReclaimTicket(), { wrapper });

  result.current.mutate("expired.ticket");

  await waitFor(() => expect(result.current.isError).toBe(true));
});
