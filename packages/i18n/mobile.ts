import mobileEn from "./en/mobile.json" with { type: "json" };
import mobileEs from "./es/mobile.json" with { type: "json" };
import mobileEsVoseo from "./es-voseo/mobile.json" with { type: "json" };

import type { Locale } from "./index.js";
import type { Register } from "@biasmarket/utils/register";
import { mergeMessages } from "./merge.js";

const mobileMessages = {
  en: mobileEn,
  es: mobileEs,
} as const;

const resolvedMobileMessages = new Map<string, (typeof mobileMessages)["es"]>();

export function getMobileMessages(
  locale: Locale,
  register: Register = "tuteo",
) {
  if (locale !== "es" || register === "tuteo") return mobileMessages[locale];

  const cached = resolvedMobileMessages.get(`${locale}:${register}`);
  if (cached) return cached;

  const resolved = mergeMessages(mobileMessages.es, mobileEsVoseo);
  resolvedMobileMessages.set(`${locale}:${register}`, resolved);
  return resolved;
}
