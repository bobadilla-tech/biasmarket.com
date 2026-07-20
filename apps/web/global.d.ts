import type { Messages } from "@biasmarket/i18n";
import type { routing } from "@/i18n/routing";

declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof routing.locales)[number];
    Messages: Messages;
  }
}
