"use client";

import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

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
    queryFn: () =>
      apiClient.notifications.findAll(storeId as string, {
        archived: String(archived),
      }),
    enabled: !!storeId && (options?.enabled ?? true),
  });
}

export function useUnreadCount(storeId: string | undefined) {
  return useQuery({
    queryKey: notificationKeys.unreadCount(storeId ?? ""),
    queryFn: () => apiClient.notifications.unreadCount(storeId as string),
    enabled: !!storeId,
  });
}
