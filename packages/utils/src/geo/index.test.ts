import { describe, expect, it } from "vitest";
import { parseCountry } from "./index.js";

describe("parseCountry", () => {
  it.each([
    ["PE", "PE"],
    [" ar ", "AR"],
    ["US", "US"],
  ])("accepts valid ISO country codes (%s)", (input, expected) => {
    expect(parseCountry(input)).toBe(expected);
  });

  it.each([null, undefined, "", "XX", "T1", "USA", "<script>", ["PE"]])(
    "rejects invalid country values (%s)",
    (input) => {
      expect(parseCountry(input as string | null | undefined)).toBeNull();
    },
  );
});
