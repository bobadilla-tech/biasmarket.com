import { expect, test } from "vitest";
import { isNewPickupPoint } from "./delivery.schema";

test("isNewPickupPoint detects the client-generated id prefix", () => {
  expect(isNewPickupPoint("new:12345")).toBe(true);
  expect(isNewPickupPoint("clx9f8g7h")).toBe(false);
});
