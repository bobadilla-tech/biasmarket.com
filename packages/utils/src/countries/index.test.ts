import { describe, expect, it } from "vitest";
import { COUNTRIES, COUNTRY_CODES, countryFlag } from "./index.js";
import { PHONE_COUNTRIES } from "../phone-country/index.js";

describe("country data", () => {
  it("has unique ISO codes and derives a flag for every country", () => {
    expect(COUNTRY_CODES).toHaveLength(249);
    expect(new Set(COUNTRY_CODES).size).toBe(COUNTRY_CODES.length);
    expect(COUNTRIES).toHaveLength(COUNTRY_CODES.length);
    for (const country of COUNTRIES) {
      expect(country.flag).toBe(countryFlag(country.iso));
      expect(Array.from(country.flag)).toHaveLength(2);
    }
  });

  it("includes every country supported by phone validation", () => {
    const codes = new Set(COUNTRY_CODES);
    for (const country of PHONE_COUNTRIES) {
      expect(codes.has(country.iso as (typeof COUNTRY_CODES)[number])).toBe(
        true,
      );
    }
  });
});
