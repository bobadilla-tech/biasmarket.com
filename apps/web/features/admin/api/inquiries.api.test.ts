import { afterEach, expect, test, vi } from "vitest";

const apiFetch = vi.fn();
vi.mock(
  "@/lib/api",
  () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }),
);

const { inquiriesApi } = await import("./inquiries.api");

afterEach(() => {
  apiFetch.mockReset();
});

test("list validates the response against inquiryListSchema", async () => {
  apiFetch.mockResolvedValue([]);

  const result = await inquiriesApi.list();

  expect(apiFetch).toHaveBeenCalledWith("/contact", {}, undefined);
  expect(result).toEqual([]);
});

test("markReviewed PATCHes the review endpoint", async () => {
  apiFetch.mockResolvedValue({});

  await inquiriesApi.markReviewed("i1");

  expect(apiFetch).toHaveBeenCalledWith("/contact/i1/review", {
    method: "PATCH",
  }, undefined);
});
