import { describe, expect, it } from "vitest";
import {
  DEFAULT_PHONE_COUNTRY,
  formatPhone,
  maskPhone,
  normalizePhone,
  parsePhoneValue,
  validatePhone,
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

  it("strips embedded and repeated plus characters", () => {
    expect(normalizePhone("+51+987654321")).toBe("+51987654321");
    expect(normalizePhone("++51 987 654 321")).toBe("+51987654321");
  });

  it("normalizes messy inputs to the same digits-only phone key", () => {
    expect(normalizePhone("+51+987-65-4-3-21")).toBe(
      normalizePhone("51987654321"),
    );
  });

  it("treats a 00 international prefix like a leading +", () => {
    expect(normalizePhone("00 51 987 654 321")).toBe("+51987654321");
    expect(normalizePhone("0051987654321")).toBe("+51987654321");
  });

  it("normalizes the seller-typed shapes from the assisted-order form", () => {
    for (const value of [
      "987654321",
      "987 654 321",
      "+51 987 654 321",
      "51987654321",
    ]) {
      expect(normalizePhone(value)).toBe("+51987654321");
    }
  });
});

describe("validatePhone", () => {
  it("accepts those same shapes as one canonical Peru mobile", () => {
    for (const value of [
      "987654321",
      "987 654 321",
      "+51 987 654 321",
      "51987654321",
    ]) {
      expect(validatePhone(value)).toEqual({
        ok: true,
        phone: "+51987654321",
      });
    }
  });

  it("rejects letters, a Peru number that does not start with 9, and a bad length", () => {
    expect(validatePhone("98765a4321")).toEqual({
      ok: false,
      message: "El número no puede contener letras",
    });
    expect(validatePhone("812345678")).toEqual({
      ok: false,
      message: "Un celular de Perú debe empezar con 9",
    });
    expect(validatePhone("98765432")).toEqual({
      ok: false,
      message: "El número no tiene un largo válido",
    });
  });

  it("rejects an empty value, an unsupported prefix, and characters outside the phone set", () => {
    expect(validatePhone("")).toEqual({
      ok: false,
      message: "El número no tiene un largo válido",
    });
    expect(validatePhone("+44 20 7946 0958")).toEqual({
      ok: false,
      message: "Prefijo no soportado",
    });
    expect(validatePhone("00442079460958")).toEqual({
      ok: false,
      message: "Prefijo no soportado",
    });
    expect(validatePhone("00 51 987 654 321")).toEqual({
      ok: true,
      phone: "+51987654321",
    });
    expect(validatePhone("98765432é1")).toEqual({
      ok: false,
      message: "El número contiene caracteres no válidos",
    });
  });

  it("accepts other PHONE_COUNTRIES numbers inside their national length and rejects the rest", () => {
    expect(validatePhone("+52 55 1234 5678")).toEqual({
      ok: true,
      phone: "+525512345678",
    });
    expect(validatePhone("+52551234567").ok).toBe(false);
    expect(validatePhone("+1 202 555 0123")).toEqual({
      ok: true,
      phone: "+12025550123",
    });
  });

  it("masks a Peru mobile as dial code, first digit, and last three digits", () => {
    expect(maskPhone("+51987654321")).toBe("+51 9** *** 321");
    expect(maskPhone("987654321")).toBe("+51 9** *** 321");
  });

  it("hides short national numbers and unknown prefixes", () => {
    expect(maskPhone("+51 98765")).toBe("+51 ***");
    expect(maskPhone("+44 20 7946 0958")).toBe("***");
  });
});

describe("formatPhone", () => {
  it("groups a Peru mobile in threes", () => {
    expect(formatPhone("+51987654321")).toBe("+51 987 654 321");
  });

  it("accepts every shape normalizePhone does", () => {
    for (const input of [
      "987654321",
      "987 654 321",
      "51987654321",
      "0051987654321",
    ]) {
      expect(formatPhone(input)).toBe("+51 987 654 321");
    }
  });

  it("does not leave a lone trailing digit", () => {
    expect(formatPhone("+525512345678")).toBe("+52 551 234 5678");
    expect(formatPhone("+5491112345678")).toBe("+54 911 123 456 78");
  });
});
