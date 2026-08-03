import { expect, test } from "vitest";
import { inquirySubmissionSchema } from "./inquiry-submission.schema";

const base = {
  name: "Jane",
  email: "jane@example.com",
  company: "",
  inquiryType: "general" as const,
  message: "Hello",
};

test("accepts a valid submission with no company", () => {
  const result = inquirySubmissionSchema.safeParse(base);
  expect(result.success).toBe(true);
});

test("rejects an empty name", () => {
  const result = inquirySubmissionSchema.safeParse({ ...base, name: "" });
  expect(result.success).toBe(false);
});

test("rejects an invalid email", () => {
  const result = inquirySubmissionSchema.safeParse({
    ...base,
    email: "not-an-email",
  });
  expect(result.success).toBe(false);
});

test("rejects an unsupported inquiryType", () => {
  const result = inquirySubmissionSchema.safeParse({
    ...base,
    inquiryType: "sales",
  });
  expect(result.success).toBe(false);
});

test("rejects an empty message", () => {
  const result = inquirySubmissionSchema.safeParse({ ...base, message: "" });
  expect(result.success).toBe(false);
});
