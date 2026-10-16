import "../global.css";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@biasmarket/query";
import { configureApiClient } from "@biasmarket/types";

const queryClient = createQueryClient();
const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_URL?.trim().replace(/\/+$/, "") ||
  "https://api.biasmarket.com/api";

configureApiClient({ baseUrl: apiBaseUrl, credentials: "omit" });

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }} />
      <StatusBar style="auto" />
    </QueryClientProvider>
  );
}
