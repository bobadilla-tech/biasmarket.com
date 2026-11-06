import { BadRequestException } from "@nestjs/common";
import { parseIdempotencyKey } from "./idempotency-key.js";

describe("parseIdempotencyKey", () => {
  it("returns undefined when the header is absent", () => {
    expect(parseIdempotencyKey(undefined)).toBeUndefined();
  });

  it("accepts a UUID v4 and normalises its case", () => {
    expect(parseIdempotencyKey("3F2504E0-4F89-41D3-9A0C-0305E82C3301")).toBe(
      "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
    );
  });

  it("rejects a repeated header", () => {
    expect(() =>
      parseIdempotencyKey([
        "3f2504e0-4f89-41d3-9a0c-0305e82c3301",
        "3f2504e0-4f89-41d3-9a0c-0305e82c3302",
      ]),
    ).toThrow(BadRequestException);
  });

  it.each([
    "",
    "not-a-uuid",
    "123",
    "a".repeat(200),
    "3f2504e0, 3f2504e1",
    "3f2504e0-4f89-11d3-9a0c-0305e82c3301", // UUID v1
    "01890f47-6c2f-7cc1-98c4-dc0c0c07398f", // UUID v7
  ])("rejects %j with a 400", (value) => {
    expect(() => parseIdempotencyKey(value)).toThrow(BadRequestException);
  });
});
