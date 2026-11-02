import { expect, test } from "vitest";
import { ApiError } from "@biasmarket/types";
import { mapCheckoutError } from "./checkout-errors.js";

test.each([
  [new ApiError("dead", 410), { kind: "expired" }],
  [new ApiError("mismatch", 409), { kind: "mismatch" }],
  [
    new ApiError("invalid phone", 400),
    { kind: "validation", message: "invalid phone" },
  ],
  [new ApiError("server failed", 500), { kind: "failed" }],
  [new TypeError("network unavailable"), { kind: "connection" }],
  [new Error("unexpected"), { kind: "failed" }],
  [undefined, { kind: "failed" }],
])("maps %s into a safe checkout error", (error, expected) => {
  expect(mapCheckoutError(error)).toEqual(expected);
});
