import { describe, expect, it } from "vitest";
import {
  isReceiptFulfillmentState,
  RECEIPT_FULFILLMENT_STATES,
} from "./index.js";

describe("order receipt states", () => {
  it("lists exactly the states after the order left ORDERING", () => {
    expect([...RECEIPT_FULFILLMENT_STATES]).toEqual([
      "IN_TRANSIT",
      "READY",
      "COMPLETED",
    ]);
  });

  it.each([
    ["ORDERING", false],
    ["IN_TRANSIT", true],
    ["READY", true],
    ["COMPLETED", true],
    ["SOMETHING_NEW", false],
  ])("%s -> %s", (status, expected) => {
    expect(isReceiptFulfillmentState(status)).toBe(expected);
  });
});
