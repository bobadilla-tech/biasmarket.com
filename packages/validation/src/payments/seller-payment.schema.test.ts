import { describe, expect, test } from "vitest";
import { buildSellerPaymentSchema } from "./seller-payment.schema";

const TODAY = "2026-10-28";
const png = { name: "capture.png", type: "image/png", size: 1000 };
const valid = (overrides: Record<string, unknown> = {}) => ({
  amount: "40",
  method: "YAPE",
  operationCode: "",
  paidAt: TODAY,
  note: "",
  file: png,
  ...overrides,
});
const errors = (maxCents: number, input: unknown) => {
  const result = buildSellerPaymentSchema(maxCents, TODAY).safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.message);
};

describe("buildSellerPaymentSchema", () => {
  test("accepts a complete payment", () => {
    expect(errors(6000, valid())).toEqual([]);
  });

  test.each([
    "",
    "0",
    "0.00",
    "1e2",
    "0x10",
    "-1",
    "1,5",
    "100.",
    " 5",
    "0.001",
  ])("rejects the amount %j", (amount) => {
    expect(errors(999999, valid({ amount }))).toContain("amountInvalid");
  });

  test("limits the amount to what can still be recorded, in cents", () => {
    expect(errors(6000, valid({ amount: "60.01" }))).toContain("amountTooHigh");
    expect(errors(6000, valid({ amount: "60" }))).toEqual([]);
    // 59.99 is the float-trap value: it must be accepted when it is the balance.
    expect(errors(5999, valid({ amount: "59.99" }))).toEqual([]);
  });

  test("requires a known method", () => {
    expect(errors(6000, valid({ method: "" }))).toContain("methodRequired");
    expect(errors(6000, valid({ method: "BTC" }))).toContain("methodRequired");
  });

  test("operation code is optional, 64 max and has no control characters", () => {
    expect(errors(6000, valid({ operationCode: "A".repeat(64) }))).toEqual([]);
    expect(errors(6000, valid({ operationCode: "A".repeat(65) }))).toContain(
      "codeInvalid",
    );
    expect(errors(6000, valid({ operationCode: "AB\nC" }))).toContain(
      "codeInvalid",
    );
    expect(errors(6000, valid({ operationCode: "AB​C" }))).toContain(
      "codeInvalid",
    );
  });

  test("paidAt is a calendar day, not in the future", () => {
    expect(errors(6000, valid({ paidAt: "2026-10-01" }))).toEqual([]);
    expect(errors(6000, valid({ paidAt: "2026-10-29" }))).toContain(
      "dateFuture",
    );
    for (const paidAt of [
      "",
      "2026-10",
      "28/10/2026",
      "2026-10-28T10:00:00Z",
    ]) {
      expect(errors(6000, valid({ paidAt }))).toContain("dateInvalid");
    }
  });

  test("a capture is required unless the method is CASH", () => {
    for (const method of ["YAPE", "PLIN", "TRANSFER"]) {
      expect(errors(6000, valid({ method, file: null }))).toContain(
        "fileRequired",
      );
    }
    expect(errors(6000, valid({ method: "CASH", file: null }))).toEqual([]);
  });

  test("the capture must be a JPEG/PNG up to 5 MB", () => {
    const pdf = { name: "x.pdf", type: "application/pdf", size: 10 };
    expect(errors(6000, valid({ file: pdf }))).toContain("fileType");
    const big = { ...png, size: 5 * 1024 * 1024 + 1 };
    expect(errors(6000, valid({ file: big }))).toContain("fileTooLarge");
    expect(errors(6000, valid({ file: { name: "x.JPG", size: 10 } }))).toEqual(
      [],
    );
  });
});
