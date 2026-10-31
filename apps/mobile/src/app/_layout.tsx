import "../global.css";
import { Stack } from "expo-router";
import { useRouter, useRootNavigationState } from "expo-router";
import * as Notifications from "expo-notifications";
import { useEffect } from "react";
import { StatusBar } from "expo-status-bar";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@biasmarket/query";
import { BuyerSessionProvider } from "../features/auth/session-context.js";
import { configureMobileApiClient } from "../features/auth/api-client.js";
import { MobileI18nProvider } from "../i18n/mobile-i18n.js";

const queryClient = createQueryClient();
configureMobileApiClient();
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  const router = useRouter();
  const navigationState = useRootNavigationState();

  useEffect(() => {
    const openNotification = (response: Notifications.NotificationResponse) => {
      const data = response.notification.request.content.data ?? {};
      if (
        data.type === "PAYMENT_REVIEWED" &&
        typeof data.orderId === "string" &&
        typeof data.storeSlug === "string"
      ) {
        router.push({
          pathname: "/orders/[orderId]",
          params: { orderId: data.orderId, storeSlug: data.storeSlug },
        });
      }
    };
    if (!navigationState?.key) return;
    const subscription =
      Notifications.addNotificationResponseReceivedListener(openNotification);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) openNotification(response);
    });
    return () => subscription.remove();
  }, [navigationState?.key, router]);

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
