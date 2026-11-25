import { expect, test } from "vitest";
import { isPdfBuyerProof } from "./payment-proof";

test.each([
  [
    "buyer PDF",
    "BUYER_SUBMITTED",
    "https://storage.example/payments/a.pdf",
    true,
  ],
  [
    "buyer image",
    "BUYER_SUBMITTED",
    "https://storage.example/payments/a.jpg",
    false,
  ],
  [
    "seller PDF path",
    "SELLER_RECORDED",
    "https://storage.example/payments/a.pdf",
    false,
  ],
  ["missing proof", "BUYER_SUBMITTED", null, false],
])("identifies %s", (_name, source, imageUrl, expected) => {
  expect(
    isPdfBuyerProof({
      source: source as "BUYER_SUBMITTED" | "SELLER_RECORDED",
      imageUrl,
    }),
  ).toBe(expected);
});
