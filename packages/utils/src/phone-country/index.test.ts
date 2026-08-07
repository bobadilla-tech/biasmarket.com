import { describe, expect, it } from "vitest";
import {
  DEFAULT_PHONE_COUNTRY,
  normalizePhone,
  parsePhoneValue,
} from "./index";

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

describe("normalizePhone", () => {
  it("leaves an already-canonical +dialCode+national number unchanged", () => {
    expect(normalizePhone("+51987654321")).toBe("+51987654321");
  });

  it("treats a bare national number as the default country", () => {
    expect(normalizePhone("987654321")).toBe("+51987654321");
  });

  it("treats a dial code with no leading + the same as one with +", () => {
    expect(normalizePhone("51987654321")).toBe("+51987654321");
  });

  it("strips spaces between digit groups", () => {
    expect(normalizePhone("+51 987 654 321")).toBe("+51987654321");
  });

  it("strips dashes and parentheses", () => {
    expect(normalizePhone("+51 (987) 654-321")).toBe("+51987654321");
  });

  it("normalizes a non-default country's dial code without a leading +", () => {
    expect(normalizePhone("52987654321")).toBe("+52987654321");
  });
});
