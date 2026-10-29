import { expect, test } from "vitest";
import {
  isNoticeApplicable,
  noticeForFulfillment,
} from "./buyer-notice-for-change";

const order = {
  source: "VENDOR_ASSISTED",
  status: "ACTIVE",
  paymentStatus: "VERIFIED",
  fulfillmentStatus: "ORDERING",
} as const;

test("maps only the fulfillment steps that have a notice (no packed notice)", () => {
  expect(noticeForFulfillment("IN_TRANSIT")).toBe("ASSISTED_IN_TRANSIT");
  expect(noticeForFulfillment("READY")).toBe("ASSISTED_READY");
  expect(noticeForFulfillment("COMPLETED")).toBe("ASSISTED_DELIVERED");
  expect(noticeForFulfillment("ORDERING")).toBeNull();
  expect(noticeForFulfillment("PACKED")).toBeNull();
});

test("only offers a notice for an assisted, active order whose state matches", () => {
  expect(isNoticeApplicable(order, "ASSISTED_PAYMENT_VALIDATED")).toBe(true);
  expect(
    isNoticeApplicable(
      { ...order, paymentStatus: "PARTIALLY_PAID" },
      "ASSISTED_PAYMENT_VALIDATED",
    ),
  ).toBe(false);
  expect(
    isNoticeApplicable(
      { ...order, fulfillmentStatus: "IN_TRANSIT" },
      "ASSISTED_IN_TRANSIT",
    ),
  ).toBe(true);
  // The refetched order disagrees with the requested step: no prompt.
  expect(isNoticeApplicable(order, "ASSISTED_READY")).toBe(false);
  expect(
    isNoticeApplicable(
      { ...order, source: "MARKETPLACE" },
      "ASSISTED_PAYMENT_VALIDATED",
    ),
  ).toBe(false);
  expect(
    isNoticeApplicable(
      { ...order, status: "CANCELLED" },
      "ASSISTED_PAYMENT_VALIDATED",
    ),
  ).toBe(false);
});
