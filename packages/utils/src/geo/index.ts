import { COUNTRY_CODES, type CountryCode } from "../countries/index.js";

export function parseCountry(
  value: string | null | undefined,
): CountryCode | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (normalized.length !== 2 || normalized === "XX") return null;
  return COUNTRY_CODES.includes(normalized as CountryCode)
    ? (normalized as CountryCode)
    : null;
}
