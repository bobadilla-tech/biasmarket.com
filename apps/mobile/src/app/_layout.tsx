import "../global.css";
import { QueryClientProvider } from "@tanstack/react-query";
import { createQueryClient } from "@biasmarket/query";
import { Stack } from "expo-router";
import { useRootNavigationState, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import * as Notifications from "expo-notifications";
import { useEffect, useRef } from "react";
import type { NotificationResponse } from "expo-notifications";
import { BuyerSessionProvider } from "../features/auth/session-context";
import { configureMobileApiClient } from "../features/auth/api-client";
import { MobileI18nProvider } from "../i18n/mobile-i18n";

const queryClient = createQueryClient();

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

configureMobileApiClient();

export default function RootLayout() {
  return (
    <QueryClientProvider client={queryClient}>
      <MobileI18nProvider>
        <BuyerSessionProvider>
          <Stack screenOptions={{ headerShown: false }} />
          <NotificationTapRouter />
          <StatusBar style="auto" />
        </BuyerSessionProvider>
      </MobileI18nProvider>
    </QueryClientProvider>
  );
}

function NotificationTapRouter() {
  const router = useRouter();
  const navigationState = useRootNavigationState();
  const pendingResponse = useRef<NotificationResponse | null>(null);
  const handledIdentifiers = useRef(new Set<string>());

  useEffect(() => {
    let active = true;
    const routeResponse = (response: NotificationResponse) => {
      const identifier = response.notification.request.identifier;
      const data = response.notification.request.content.data;
      if (
        !data ||
        response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER ||
        handledIdentifiers.current.has(identifier) ||
        data.type !== "PAYMENT_PROOF_REVIEWED" ||
        typeof data.orderId !== "string" ||
        typeof data.storeSlug !== "string"
      ) {
        return;
      }
      if (!navigationState?.key) {
        pendingResponse.current = response;
        return;
      }

      handledIdentifiers.current.add(identifier);
      pendingResponse.current = null;
      router.push({
        pathname: "/orders/[orderId]",
        params: { orderId: data.orderId, storeSlug: data.storeSlug },
      });
      void Notifications.clearLastNotificationResponseAsync();
    };

    if (pendingResponse.current) routeResponse(pendingResponse.current);
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (active && response) routeResponse(response);
    });
    const subscription =
      Notifications.addNotificationResponseReceivedListener(routeResponse);

    return () => {
      active = false;
      subscription.remove();
    };
  }, [navigationState?.key, router]);

  return null;
}
