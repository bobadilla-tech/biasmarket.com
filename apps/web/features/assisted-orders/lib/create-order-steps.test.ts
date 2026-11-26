import { expect, test } from "vitest";
import {
  canContinueFromSummary,
  nextCreateOrderStep,
  previousCreateOrderStep,
} from "./create-order-steps";

test("walks products → summary → details and stops at the ends", () => {
  expect(nextCreateOrderStep("products")).toBe("summary");
  expect(nextCreateOrderStep("summary")).toBe("details");
  expect(nextCreateOrderStep("details")).toBeNull();
  expect(previousCreateOrderStep("details")).toBe("summary");
  expect(previousCreateOrderStep("summary")).toBe("products");
  expect(previousCreateOrderStep("products")).toBeNull();
});

test("summary continue requires at least one product line", () => {
  expect(canContinueFromSummary(0)).toBe(false);
  expect(canContinueFromSummary(1)).toBe(true);
});
