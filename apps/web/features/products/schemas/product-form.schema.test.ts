import { expect, test } from "vitest";
import { productFormSchema } from "./product-form.schema";

test("accepts a valid product form payload", () => {
  const result = productFormSchema.safeParse({
    name: "Tee",
    description: "",
    price: "10.00",
    currency: "USD",
    stock: "5",
    categoryId: "c1",
    availability: "AVAILABLE",
  });
  expect(result.success).toBe(true);
});

test("rejects an empty name", () => {
  const result = productFormSchema.safeParse({
    name: "",
    description: "",
    price: "10.00",
    currency: "USD",
    stock: "",
    categoryId: "",
  });
  expect(result.success).toBe(false);
});

test("rejects an unsupported currency", () => {
  const result = productFormSchema.safeParse({
    name: "Tee",
    description: "",
    price: "10.00",
    currency: "XXX",
    stock: "",
    categoryId: "",
  });
  expect(result.success).toBe(false);
});
