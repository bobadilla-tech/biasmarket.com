import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { BuyerSessionProvider } from "../features/auth/session-context.js";
import { configureMobileApiClient } from "../features/auth/api-client.js";
import { MobileI18nProvider } from "../i18n/mobile-i18n.js";

configureMobileApiClient();

export default function RootLayout() {
  return (
    <MobileI18nProvider>
      <BuyerSessionProvider>
        <Stack screenOptions={{ headerShown: false }} />
        <StatusBar style="auto" />
      </BuyerSessionProvider>
    </MobileI18nProvider>
  );
}
