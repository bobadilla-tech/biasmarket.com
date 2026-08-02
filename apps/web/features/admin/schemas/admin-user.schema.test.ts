import { expect, test } from "vitest";
import { storeCountListSchema } from "./admin-user.schema";

test("storeCountListSchema parses a list of userId/storeCount pairs", () => {
  const result = storeCountListSchema.safeParse([{ userId: "u1", storeCount: 2 }]);
  expect(result.success).toBe(true);
});

test("storeCountListSchema rejects a non-numeric storeCount", () => {
  const result = storeCountListSchema.safeParse([{ userId: "u1", storeCount: "2" }]);
  expect(result.success).toBe(false);
});
