import { describe, expect, it } from "vitest";
import { DEFAULT_PHONE_COUNTRY, parsePhoneValue } from "./index";

describe("parsePhoneValue", () => {
  it("matches the country by dial code and returns the remaining national number", () => {
    const result = parsePhoneValue("+51987654321");
    expect(result.country.iso).toBe("PE");
    expect(result.nationalNumber).toBe("987654321");
  });

  it("prefers the longest matching dial code over a shorter overlapping one", () => {
    const result = parsePhoneValue("+593987654321");
    expect(result.country.iso).toBe("EC");
    expect(result.nationalNumber).toBe("987654321");
  });

  it("falls back to the default country for an empty string", () => {
    const result = parsePhoneValue("");
    expect(result.country).toBe(DEFAULT_PHONE_COUNTRY);
    expect(result.nationalNumber).toBe("");
  });

  it("falls back to the default country for a value with no matching dial code", () => {
    const result = parsePhoneValue("999999999");
    expect(result.country).toBe(DEFAULT_PHONE_COUNTRY);
    expect(result.nationalNumber).toBe("999999999");
  });
});
