import { describe, expect, it } from "vitest";
import { customerLoginSchema } from "./login.schema";

describe("customerLoginSchema", () => {
  it("accepts a valid phone and password", () => {
    const result = customerLoginSchema.safeParse({
      phone: "+51988888888",
      password: "super-secret-1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty phone", () => {
    const result = customerLoginSchema.safeParse({
      phone: "",
      password: "super-secret-1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an empty password", () => {
    const result = customerLoginSchema.safeParse({
      phone: "+51988888888",
      password: "",
    });
    expect(result.success).toBe(false);
  });
});
