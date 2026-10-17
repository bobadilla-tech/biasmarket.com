import "../global.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@biasmarket/query";
import { Stack } from "expo-router";
import { useRouter, type Href } from "expo-router";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { BuyerSessionProvider } from "../features/auth/session-context";
import { configureMobileApiClient } from "../features/auth/api-client";

const queryClient = createQueryClient();

configureMobileApiClient();

export default function RootLayout() {
  const router = useRouter();

  useEffect(() => {
    const openNotification = (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data;
      if (
        data.type === "PAYMENT_REVIEWED" &&
        typeof data.orderId === "string"
      ) {
        router.push(`/orders/${encodeURIComponent(data.orderId)}` as Href);
      }
    };
    const subscription =
      Notifications.addNotificationResponseReceivedListener(openNotification);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openNotification(response);
    });
    return () => subscription.remove();
  }, [router]);

  return (
    <QueryClientProvider client={queryClient}>
      <BuyerSessionProvider>
        <Stack screenOptions={{ headerShown: false }} />
        <StatusBar style="auto" />
      </BuyerSessionProvider>
    </QueryClientProvider>
  );
}
