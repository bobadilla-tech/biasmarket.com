import { expect, test, vi } from "vitest";

vi.mock("@/lib/api-client", () => ({ apiClient: {} }));

test("the barrel exports OriginLabel so other features need no deep import", async () => {
  const barrel = await import("./index");
  expect(typeof barrel.OriginLabel).toBe("function");
});
