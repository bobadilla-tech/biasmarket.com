import { describe, expect, it } from "vitest";
import { customerRegisterSchema } from "./register.schema";

describe("customerRegisterSchema", () => {
  it("accepts matching passwords of sufficient length", () => {
    const result = customerRegisterSchema.safeParse({
      password: "super-secret-1",
      confirmPassword: "super-secret-1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a password shorter than 8 characters", () => {
    const result = customerRegisterSchema.safeParse({
      password: "short",
      confirmPassword: "short",
    });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched passwords", () => {
    const result = customerRegisterSchema.safeParse({
      password: "super-secret-1",
      confirmPassword: "different-1",
    });
    expect(result.success).toBe(false);
  });
});
