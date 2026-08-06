import { expect, test } from "vitest";
import {
  restockRequestFormSchema,
  restockRequestListSchema,
  restockRequestSchema,
} from "./restock-request.schema";

test("form schema accepts a name and phone", () => {
  const result = restockRequestFormSchema.parse({
    name: "Jane",
    phone: "+51999000111",
  });
  expect(result.name).toBe("Jane");
});

test("form schema rejects an empty name", () => {
  expect(
    restockRequestFormSchema.safeParse({ name: "", phone: "+51999000111" })
      .success,
  ).toBe(false);
});

test("form schema rejects an empty phone", () => {
  expect(
    restockRequestFormSchema.safeParse({ name: "Jane", phone: "" }).success,
  ).toBe(false);
});

test("list schema accepts variant-null legacy rows", () => {
  const list = restockRequestListSchema.parse([
    {
      id: "req-1",
      name: "Jane",
      phone: "+51999000111",
      createdAt: "2026-08-05T12:00:00.000Z",
      product: { id: "product-1", name: "Photocard", images: [] },
      variant: null,
    },
  ]);
  expect(list[0].variant).toBeNull();
});

test("request schema rejects a row without product context", () => {
  expect(
    restockRequestSchema.safeParse({
      id: "req-1",
      name: "Jane",
      phone: "+51999000111",
      createdAt: "2026-08-05T12:00:00.000Z",
    }).success,
  ).toBe(false);
});
