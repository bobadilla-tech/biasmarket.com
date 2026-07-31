import { expect, test } from "vitest";
import { deliveryMethodListSchema, pickupPointListSchema, isNewPickupPoint } from "./delivery.schema";

test("parses a list of delivery methods", () => {
  const result = deliveryMethodListSchema.safeParse([
    { type: "PICKUP", enabled: true, details: {} },
    { type: "COURIER", enabled: false, details: { estimatedCost: 10 } },
  ]);
  expect(result.success).toBe(true);
});

test("rejects an unknown delivery method type", () => {
  const result = deliveryMethodListSchema.safeParse([{ type: "DRONE", enabled: true, details: {} }]);
  expect(result.success).toBe(false);
});

test("parses a list of pickup points", () => {
  const result = pickupPointListSchema.safeParse([
    { id: "p1", label: "Main store", enabled: true, sortOrder: 0 },
  ]);
  expect(result.success).toBe(true);
});

test("isNewPickupPoint detects the client-generated id prefix", () => {
  expect(isNewPickupPoint("new:12345")).toBe(true);
  expect(isNewPickupPoint("clx9f8g7h")).toBe(false);
});
