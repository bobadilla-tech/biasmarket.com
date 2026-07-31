import { expect, test } from "vitest";
import { createStoreFormSchema } from "./create-store.schema";

const valid = {
  name: "Demo Store",
  slug: "demo-store",
  whatsappNumber: "+51987654321",
  defaultCurrency: "PEN",
};

test("accepts a valid create-store payload", () => {
  expect(createStoreFormSchema.safeParse(valid).success).toBe(true);
});

test("rejects a name shorter than 2 chars", () => {
  expect(createStoreFormSchema.safeParse({ ...valid, name: "a" }).success).toBe(false);
});

test("rejects an unsupported currency", () => {
  expect(
    createStoreFormSchema.safeParse({ ...valid, defaultCurrency: "XYZ" }).success,
  ).toBe(false);
});

test("rejects a whatsapp number shorter than 6 chars", () => {
  expect(
    createStoreFormSchema.safeParse({ ...valid, whatsappNumber: "123" }).success,
  ).toBe(false);
});
