import { beforeEach, expect, test, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock("@/lib/api", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const { suggestionsApi } = await import("./suggestions.api");

beforeEach(() => {
  apiFetch.mockReset();
});

test("list calls the store-scoped suggestions endpoint and validates the response", async () => {
  apiFetch.mockResolvedValueOnce([
    { id: "low-stock", severity: "warning", titleKey: "lowStock", bodyParams: { count: 2 } },
  ]);

  const result = await suggestionsApi.list("store-1");

  expect(apiFetch).toHaveBeenCalledWith("/stores/store-1/suggestions", {}, undefined);
  expect(result).toHaveLength(1);
});
