import { expect, test } from "vitest";
import { getDescriptionItems } from "./description-items";

test("splits short comma-separated product contents into list items", () => {
  expect(
    getDescriptionItems("Envelope, cover, photo book, stickers, photo"),
  ).toEqual(["Envelope", "cover", "photo book", "stickers", "photo"]);
});

test("leaves ordinary prose and short phrases as paragraphs", () => {
  expect(
    getDescriptionItems(
      "Handmade with care, ships in two days, and includes a gift note.",
    ),
  ).toBeNull();
  expect(getDescriptionItems("Envelope, cover")).toBeNull();
});
