import { expect, test } from "vitest";
import { profileFormSchema } from "./profile.schema";

test("accepts a valid profile payload", () => {
  const result = profileFormSchema.safeParse({
    name: "My Store",
    whatsappNumber: "+51987654321",
    paymentInstructions: "Bank transfer to account X",
    defaultCurrency: "PEN",
  });
  expect(result.success).toBe(true);
});

test("rejects an empty name", () => {
  const result = profileFormSchema.safeParse({
    name: "",
    whatsappNumber: "+51987654321",
    paymentInstructions: "",
    defaultCurrency: "PEN",
  });
  expect(result.success).toBe(false);
});

test("allows empty payment instructions", () => {
  const result = profileFormSchema.safeParse({
    name: "My Store",
    whatsappNumber: "+51987654321",
    paymentInstructions: "",
    defaultCurrency: "PEN",
  });
  expect(result.success).toBe(true);
});
