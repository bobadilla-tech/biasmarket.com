import mobileEn from "./en/mobile.json" with { type: "json" };
import mobileEs from "./es/mobile.json" with { type: "json" };

import type { Locale } from "./index.js";

const mobileMessages = {
  en: mobileEn,
  es: mobileEs,
} as const;

export function getMobileMessages(locale: Locale) {
  return mobileMessages[locale];
}
