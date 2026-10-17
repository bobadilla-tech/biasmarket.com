import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import * as SecureStore from "expo-secure-store";
import { customFetch } from "@biasmarket/types";

const STORAGE_KEY = "buyer-expo-push-token";

export async function registerBuyerPushToken(
  storeSlug: string,
  channelName: string,
): Promise<void> {
  if (Platform.OS === "web") return;
  const permission = await Notifications.getPermissionsAsync();
  const granted =
    permission.granted ||
    (await Notifications.requestPermissionsAsync()).granted;
  if (!granted) return;
  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: channelName,
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId) return;
  const { data: expoPushToken } = await Notifications.getExpoPushTokenAsync({
    projectId,
  });
  await customFetch(
    `/stores/${encodeURIComponent(storeSlug)}/account/devices`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expoPushToken, platform: Platform.OS }),
    },
  );
  await SecureStore.setItemAsync(STORAGE_KEY, expoPushToken);
}

export async function unregisterBuyerPushToken(
  storeSlug: string,
): Promise<void> {
  const expoPushToken = await SecureStore.getItemAsync(STORAGE_KEY);
  if (!expoPushToken) return;
  await customFetch(
    `/stores/${encodeURIComponent(storeSlug)}/account/devices`,
    {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ expoPushToken, platform: Platform.OS }),
    },
  );
  await SecureStore.deleteItemAsync(STORAGE_KEY);
}
