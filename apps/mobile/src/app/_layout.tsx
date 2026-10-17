import "../global.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@biasmarket/query";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { BuyerSessionProvider } from "../features/auth/session-context";
import { configureMobileApiClient } from "../features/auth/api-client";

const queryClient = createQueryClient();

configureMobileApiClient();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <BuyerSessionProvider>
        <Stack screenOptions={{ headerShown: false }} />
        <StatusBar style="auto" />
      </BuyerSessionProvider>
    </QueryClientProvider>
  );
}
