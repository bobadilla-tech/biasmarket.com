import { useQuery } from "@tanstack/react-query";
import { notificationsApi } from "../api/notifications.api";

export const notificationKeys = {
  all: (storeId: string) => ["notifications", storeId] as const,
  list: (storeId: string, archived: boolean) =>
    [...notificationKeys.all(storeId), "list", archived] as const,
  unreadCount: (storeId: string) =>
    [...notificationKeys.all(storeId), "unread-count"] as const,
};

export function useNotifications(
  storeId: string | undefined,
  archived: boolean,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: notificationKeys.list(storeId ?? "", archived),
    queryFn: () => notificationsApi.list(storeId as string, archived),
    enabled: !!storeId && (options?.enabled ?? true),
  });
}

export function useUnreadCount(storeId: string | undefined) {
  return useQuery({
    queryKey: notificationKeys.unreadCount(storeId ?? ""),
    queryFn: () => notificationsApi.unreadCount(storeId as string),
    enabled: !!storeId,
  });
}
