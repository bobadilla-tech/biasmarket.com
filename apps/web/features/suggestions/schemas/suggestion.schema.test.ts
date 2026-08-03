import { expect, test } from "vitest";
import { suggestionListSchema } from "./suggestion.schema";

test("parses a full suggestion list", () => {
  const valid = [
    {
      id: "low-stock",
      severity: "warning",
      titleKey: "lowStock",
      bodyParams: { count: 2 },
    },
    {
      id: "top-seller",
      severity: "info",
      titleKey: "topSeller",
      bodyParams: { name: "Widget", count: 12 },
    },
  ];
  expect(suggestionListSchema.safeParse(valid).success).toBe(true);
});

test("parses an empty list", () => {
  expect(suggestionListSchema.safeParse([]).success).toBe(true);
});

test("rejects an unknown severity", () => {
  const invalid = [{
    id: "x",
    severity: "urgent",
    titleKey: "x",
    bodyParams: {},
  }];
  expect(suggestionListSchema.safeParse(invalid).success).toBe(false);
});
