import { apiFetch } from "@/lib/api";
import {
  notificationListSchema,
  unreadCountSchema,
} from "../schemas/notification.schema";

export const notificationsApi = {
  list: async (storeId: string, archived: boolean) => {
    const data = await apiFetch(
      `/stores/${storeId}/notifications?archived=${archived}`,
    );
    return notificationListSchema.parse(data);
  },
  unreadCount: async (storeId: string) => {
    const data = await apiFetch(`/stores/${storeId}/notifications/unread-count`);
    return unreadCountSchema.parse(data);
  },
  markRead: (storeId: string, notificationId: string) =>
    apiFetch(`/stores/${storeId}/notifications/${notificationId}/read`, {
      method: "PATCH",
    }),
  markAllRead: (storeId: string) =>
    apiFetch(`/stores/${storeId}/notifications/read-all`, { method: "POST" }),
  archive: (storeId: string, notificationId: string) =>
    apiFetch(`/stores/${storeId}/notifications/${notificationId}/archive`, {
      method: "PATCH",
    }),
};
