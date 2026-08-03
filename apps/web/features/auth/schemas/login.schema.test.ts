import { expect, test } from "vitest";
import { loginSchema } from "./login.schema";

test("accepts a valid email/password pair", () => {
  const result = loginSchema.safeParse({
    email: "a@b.com",
    password: "secret",
  });
  expect(result.success).toBe(true);
});

test("rejects a malformed email", () => {
  const result = loginSchema.safeParse({
    email: "not-an-email",
    password: "secret",
  });
  expect(result.success).toBe(false);
});

test("rejects an empty password", () => {
  const result = loginSchema.safeParse({ email: "a@b.com", password: "" });
  expect(result.success).toBe(false);
});
