import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@biasmarket/query";
import { BuyerSessionProvider } from "../features/auth/session-context";
import { configureMobileApiClient } from "../features/auth/api-client";
import { MobileI18nProvider } from "../i18n/mobile-i18n";

const queryClient = createQueryClient();
configureMobileApiClient();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <MobileI18nProvider>
        <BuyerSessionProvider>
          <Stack screenOptions={{ headerShown: false }} />
          <StatusBar style="auto" />
        </BuyerSessionProvider>
      </MobileI18nProvider>
    </QueryClientProvider>
  );
}
