import { describe, expect, it } from "vitest";
import { customerChangePasswordSchema } from "./change-password.schema";

describe("customerChangePasswordSchema", () => {
  it("accepts matching new passwords of sufficient length", () => {
    const result = customerChangePasswordSchema.safeParse({
      currentPassword: "old-secret-1",
      newPassword: "new-secret-1",
      confirmNewPassword: "new-secret-1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a new password shorter than 8 characters", () => {
    const result = customerChangePasswordSchema.safeParse({
      currentPassword: "old-secret-1",
      newPassword: "short",
      confirmNewPassword: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched new passwords", () => {
    const result = customerChangePasswordSchema.safeParse({
      currentPassword: "old-secret-1",
      newPassword: "new-secret-1",
      confirmNewPassword: "different-1",
    });
    expect(result.success).toBe(false);
  });
});
