import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationsApi } from "../api/notifications.api";
import { notificationKeys } from "../queries/use-notifications";

export function useMarkAllRead(storeId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => notificationsApi.markAllRead(storeId as string),
    onSuccess: () => {
      if (!storeId) return;
      queryClient.invalidateQueries({ queryKey: notificationKeys.all(storeId) });
    },
  });
}
