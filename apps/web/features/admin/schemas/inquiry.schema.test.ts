import { expect, test } from "vitest";
import { inquiryListSchema } from "./inquiry.schema";

test("inquiryListSchema accepts a NEW inquiry with null company/inquiryType", () => {
  const result = inquiryListSchema.safeParse([
    {
      id: "i1",
      name: "Jane",
      email: "jane@example.com",
      company: null,
      inquiryType: null,
      message: "hi",
      status: "NEW",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ]);
  expect(result.success).toBe(true);
});

test("inquiryListSchema rejects an unknown status", () => {
  const result = inquiryListSchema.safeParse([
    {
      id: "i1",
      name: "Jane",
      email: "jane@example.com",
      company: null,
      inquiryType: null,
      message: "hi",
      status: "PENDING",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ]);
  expect(result.success).toBe(false);
});
