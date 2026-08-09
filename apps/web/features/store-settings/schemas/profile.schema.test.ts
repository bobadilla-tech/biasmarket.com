import { expect, test } from "vitest";
import { profileFormSchema } from "./profile.schema";

test("accepts a valid profile payload", () => {
  const result = profileFormSchema.safeParse({
    name: "My Store",
    whatsappNumber: "+51987654321",
    paymentInstructions: "Bank transfer to account X",
    defaultCurrency: "PEN",
    locale: "es",
  });
  expect(result.success).toBe(true);
});

test("rejects an empty name", () => {
  const result = profileFormSchema.safeParse({
    name: "",
    whatsappNumber: "+51987654321",
    paymentInstructions: "",
    defaultCurrency: "PEN",
    locale: "es",
  });
  expect(result.success).toBe(false);
});

test("allows empty payment instructions", () => {
  const result = profileFormSchema.safeParse({
    name: "My Store",
    whatsappNumber: "+51987654321",
    paymentInstructions: "",
    defaultCurrency: "PEN",
    locale: "es",
  });
  expect(result.success).toBe(true);
});

test("accepts valid locale and social link URLs", () => {
  const result = profileFormSchema.safeParse({
    name: "My Store",
    whatsappNumber: "+51987654321",
    paymentInstructions: "",
    defaultCurrency: "PEN",
    locale: "en",
    instagramUrl: "https://instagram.com/mystore",
    facebookUrl: "https://facebook.com/mystore",
    tiktokUrl: "",
    twitterUrl: "",
  });
  expect(result.success).toBe(true);
});

test("rejects invalid social link URL", () => {
  const result = profileFormSchema.safeParse({
    name: "My Store",
    whatsappNumber: "+51987654321",
    paymentInstructions: "",
    defaultCurrency: "PEN",
    instagramUrl: "not-a-url",
  });
  expect(result.success).toBe(false);
});
