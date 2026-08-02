import { expect, test } from "vitest";
import { changePasswordSchema } from "./change-password.schema";

const valid = {
  currentPassword: "current-pass",
  newPassword: "newpassword1",
  confirmPassword: "newpassword1",
};

test("accepts matching new/confirm passwords", () => {
  expect(changePasswordSchema.safeParse(valid).success).toBe(true);
});

test("rejects when new and confirm passwords don't match", () => {
  const result = changePasswordSchema.safeParse({ ...valid, confirmPassword: "different1" });
  expect(result.success).toBe(false);
});

test("rejects a new password shorter than 8 characters", () => {
  const result = changePasswordSchema.safeParse({
    ...valid,
    newPassword: "short",
    confirmPassword: "short",
  });
  expect(result.success).toBe(false);
});
