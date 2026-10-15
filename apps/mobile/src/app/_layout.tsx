import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { BuyerSessionProvider } from "../features/auth/session-context.js";
import { configureMobileApiClient } from "../features/auth/api-client.js";

configureMobileApiClient();

export default function RootLayout() {
  return (
    <BuyerSessionProvider>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="auto" />
    </BuyerSessionProvider>
  );
}
