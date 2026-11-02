import adminEn from "./en/admin.json" with { type: "json" };
import adminEs from "./es/admin.json" with { type: "json" };
import blogEn from "./en/blog.json" with { type: "json" };
import blogEs from "./es/blog.json" with { type: "json" };
import commonEn from "./en/common.json" with { type: "json" };
import commonEs from "./es/common.json" with { type: "json" };
import dashboardEn from "./en/dashboard.json" with { type: "json" };
import dashboardEs from "./es/dashboard.json" with { type: "json" };
import forSellersEn from "./en/for-sellers.json" with { type: "json" };
import forSellersEs from "./es/for-sellers.json" with { type: "json" };
import landingEn from "./en/landing.json" with { type: "json" };
import landingEs from "./es/landing.json" with { type: "json" };
import marketingEn from "./en/marketing.json" with { type: "json" };
import marketingEs from "./es/marketing.json" with { type: "json" };
import onboardingEn from "./en/onboarding.json" with { type: "json" };
import onboardingEs from "./es/onboarding.json" with { type: "json" };
import storefrontEn from "./en/storefront.json" with { type: "json" };
import storefrontEs from "./es/storefront.json" with { type: "json" };
import couponsEn from "./en/coupons.json" with { type: "json" };
import couponsEs from "./es/coupons.json" with { type: "json" };
import commonEsVoseo from "./es-voseo/common.json" with { type: "json" };
import dashboardEsVoseo from "./es-voseo/dashboard.json" with { type: "json" };
import onboardingEsVoseo from "./es-voseo/onboarding.json" with { type: "json" };
import storefrontEsVoseo from "./es-voseo/storefront.json" with { type: "json" };
import { type Register } from "@biasmarket/utils/register";
import { mergeMessages } from "./merge.js";

const messages = {
  en: {
    admin: adminEn,
    blog: blogEn,
    common: commonEn,
    forSellers: forSellersEn,
    landing: landingEn,
    marketing: marketingEn,
    dashboard: dashboardEn,
    onboarding: onboardingEn,
    storefront: storefrontEn,
    coupons: couponsEn,
  },
  es: {
    admin: adminEs,
    blog: blogEs,
    common: commonEs,
    forSellers: forSellersEs,
    landing: landingEs,
    marketing: marketingEs,
    dashboard: dashboardEs,
    onboarding: onboardingEs,
    storefront: storefrontEs,
    coupons: couponsEs,
  },
} as const;

export type Locale = keyof typeof messages;
export const locales = Object.keys(messages) as Locale[];
export type Messages = (typeof messages)["en"];

const esVoseo = {
  common: commonEsVoseo,
  dashboard: dashboardEsVoseo,
  onboarding: onboardingEsVoseo,
  storefront: storefrontEsVoseo,
};

const resolvedMessages = new Map<string, Messages>();

export function getMessages(
  locale: Locale,
  register: Register = "tuteo",
): Messages {
  if (locale !== "es" || register === "tuteo") return messages[locale];

  const cached = resolvedMessages.get(`${locale}:${register}`);
  if (cached) return cached;

  const resolved = mergeMessages(messages.es, esVoseo);
  resolvedMessages.set(`${locale}:${register}`, resolved);
  return resolved;
}

export { mergeMessages } from "./merge.js";
export { resolveRegister, VOSEO_COUNTRIES } from "@biasmarket/utils/register";
export type { Register, RegisterSetting } from "@biasmarket/utils/register";
