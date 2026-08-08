import { expect, test } from "vitest";
import { restockRequestFormSchema } from "./restock-request.schema";

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
