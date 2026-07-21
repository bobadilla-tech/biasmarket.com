export const SUPPORTED_CURRENCIES = [
  "PEN",
  "USD",
  "EUR",
  "MXN",
  "ARS",
  "COP",
  "CLP",
  "BRL",
  "GBP",
] as const;

export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];
