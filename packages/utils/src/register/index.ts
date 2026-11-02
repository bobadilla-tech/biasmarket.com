import { parseCountry } from "../geo/index.js";
import type { CountryCode } from "../countries/index.js";

export const REGISTERS = ["tuteo", "voseo"] as const;
export type Register = (typeof REGISTERS)[number];

export const REGISTER_SETTINGS = ["auto", ...REGISTERS] as const;
export type RegisterSetting = (typeof REGISTER_SETTINGS)[number];

export const VOSEO_COUNTRIES = new Set([
  "AR",
  "UY",
  "PY",
  "CR",
  "NI",
  "HN",
  "SV",
  "GT",
]);

export function resolveRegister(input: {
  locale: string;
  setting?: RegisterSetting;
  country?: string | null;
}): Register {
  if (input.locale !== "es") return "tuteo";
  if (input.setting === "voseo" || input.setting === "tuteo") {
    return input.setting;
  }
  const country = parseCountry(input.country);
  return country && VOSEO_COUNTRIES.has(country) ? "voseo" : "tuteo";
}

export function resolveStoreCountry(
  store: { countryCode?: string | null },
  owner?: { countryCode?: string | null } | null,
): CountryCode {
  return (
    parseCountry(store.countryCode) ?? parseCountry(owner?.countryCode) ?? "PE"
  );
}

export type StoreCountrySource = {
  countryCode?: string | null;
};
