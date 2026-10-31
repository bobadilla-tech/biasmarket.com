import "reflect-metadata";
import { plainToInstance } from "class-transformer";
import { validate } from "class-validator";
import { CreateAssistedOrderDto } from "./create-assisted-order.dto.js";

const base = {
  deliveryMethodType: "PICKUP",
  customerPhone: "987 654 321",
  items: [{ productId: "p", quantity: 1 }],
};

async function check(overrides: Record<string, unknown> = {}) {
  const dto = plainToInstance(CreateAssistedOrderDto, {
    ...base,
    ...overrides,
  });
  return validate(dto, { whitelist: true, forbidNonWhitelisted: true });
}

describe("CreateAssistedOrderDto", () => {
  it("accepts a valid body", async () => {
    expect(await check({ customerName: "Sofi" })).toEqual([]);
  });

  it("rejects empty and malformed phones with the lookup message", async () => {
    for (const customerPhone of ["", "abc", "12345", "+51 12345678"]) {
      const errors = await check({ customerPhone });
      expect(errors[0]?.property).toBe("customerPhone");
      expect(Object.values(errors[0]!.constraints!).join(" ")).not.toMatch(
        /\d{8,}/,
      );
    }
  });

  it("rejects long aliases and control characters", async () => {
    expect((await check({ customerName: "x".repeat(61) }))[0]?.property).toBe(
      "customerName",
    );
    expect((await check({ customerName: "a\u0007b" }))[0]?.property).toBe(
      "customerName",
    );
  });

  it("rejects fields the seller must not set", async () => {
    for (const extra of [
      { source: "MARKETPLACE" },
      { createdByUserId: "u" },
      { customerEmail: "a@b.com" },
      { expiresAt: "2030-01-01" },
      { storeId: "s" },
    ]) {
      expect((await check(extra)).length).toBeGreaterThan(0);
    }
  });
});
