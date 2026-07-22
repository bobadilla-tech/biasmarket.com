import adminEn from "./en/admin.json" with { type: "json" };
import adminEs from "./es/admin.json" with { type: "json" };
import commonEn from "./en/common.json" with { type: "json" };
import commonEs from "./es/common.json" with { type: "json" };
import dashboardEn from "./en/dashboard.json" with { type: "json" };
import dashboardEs from "./es/dashboard.json" with { type: "json" };
import landingEn from "./en/landing.json" with { type: "json" };
import landingEs from "./es/landing.json" with { type: "json" };
import marketingEn from "./en/marketing.json" with { type: "json" };
import marketingEs from "./es/marketing.json" with { type: "json" };
import onboardingEn from "./en/onboarding.json" with { type: "json" };
import onboardingEs from "./es/onboarding.json" with { type: "json" };
import storefrontEn from "./en/storefront.json" with { type: "json" };
import storefrontEs from "./es/storefront.json" with { type: "json" };

const messages = {
  en: {
    admin: adminEn,
    common: commonEn,
    landing: landingEn,
    marketing: marketingEn,
    dashboard: dashboardEn,
    onboarding: onboardingEn,
    storefront: storefrontEn,
  },
  es: {
    admin: adminEs,
    common: commonEs,
    landing: landingEs,
    marketing: marketingEs,
    dashboard: dashboardEs,
    onboarding: onboardingEs,
    storefront: storefrontEs,
  },
} as const;

export type Locale = keyof typeof messages;
export const locales = Object.keys(messages) as Locale[];
export type Messages = (typeof messages)["en"];

export function getMessages(locale: Locale): Messages {
  return messages[locale];
}
