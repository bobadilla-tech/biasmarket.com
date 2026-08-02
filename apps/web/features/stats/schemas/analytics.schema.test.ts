import { expect, test } from "vitest";
import { analyticsResultSchema } from "./analytics.schema";

const valid = {
  range: "30d",
  buckets: [
    {
      start: "2026-08-01T00:00:00.000Z",
      end: "2026-08-02T00:00:00.000Z",
      revenue: 120.5,
      orderCount: 3,
      newCustomers: 1,
      returningCustomers: 2,
    },
  ],
  topProducts: [{ productId: "product-1", name: "Widget", unitsSold: 12 }],
};

test("parses a full analytics payload", () => {
  expect(analyticsResultSchema.safeParse(valid).success).toBe(true);
});

test("parses when there are no buckets or top products yet", () => {
  expect(
    analyticsResultSchema.safeParse({ ...valid, buckets: [], topProducts: [] }).success,
  ).toBe(true);
});

test("rejects an unknown range value", () => {
  expect(analyticsResultSchema.safeParse({ ...valid, range: "1y" }).success).toBe(false);
});
