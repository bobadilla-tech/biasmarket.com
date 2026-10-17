import { describe, expect, test } from "vitest";
import { buildSubmitProofSchema } from "./submit-proof.schema";

const png = () => new File(["x"], "proof.png", { type: "image/png" });
const valid = (overrides: Record<string, unknown> = {}) => ({
  amount: "30.00",
  method: "YAPE",
  operationCode: "",
  file: png(),
  ...overrides,
});
const errorsOf = (maxCents: number, input: unknown) => {
  const result = buildSubmitProofSchema(maxCents).safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.message);
};

describe("buildSubmitProofSchema", () => {
  test("accepts a complete form", () => {
    expect(errorsOf(3000, valid())).toEqual([]);
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
    expect(errorsOf(999999, valid({ amount }))).toContain("amountInvalid");
  });

  test("rejects an amount over what is left, in cents", () => {
    expect(errorsOf(3000, valid({ amount: "30.01" }))).toContain(
      "amountTooHigh",
    );
    expect(errorsOf(3000, valid({ amount: "30" }))).toEqual([]);
  });

  test("requires a known method", () => {
    expect(errorsOf(3000, valid({ method: undefined }))).toContain(
      "methodRequired",
    );
    expect(errorsOf(3000, valid({ method: "BTC" }))).toContain(
      "methodRequired",
    );
  });

  test("operation code: optional, 64 max, no control characters", () => {
    expect(errorsOf(3000, valid({ operationCode: "A".repeat(64) }))).toEqual(
      [],
    );
    expect(errorsOf(3000, valid({ operationCode: "A".repeat(65) }))).toContain(
      "codeInvalid",
    );
    expect(errorsOf(3000, valid({ operationCode: "AB\nC" }))).toContain(
      "codeInvalid",
    );
  });

  test("requires a JPEG/PNG file up to 5 MB", () => {
    expect(errorsOf(3000, valid({ file: null }))).toContain("fileRequired");
    const pdf = new File(["x"], "proof.pdf", { type: "application/pdf" });
    expect(errorsOf(3000, valid({ file: pdf }))).toContain("fileType");
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "p.png", {
      type: "image/png",
    });
    expect(errorsOf(3000, valid({ file: big }))).toContain("fileTooLarge");
    const noType = new File(["x"], "proof.JPG");
    expect(errorsOf(3000, valid({ file: noType }))).toEqual([]);
  });
});
