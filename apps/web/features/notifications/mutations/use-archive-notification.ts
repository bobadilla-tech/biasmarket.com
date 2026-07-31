import { useMutation, useQueryClient } from "@tanstack/react-query";
import { notificationsApi } from "../api/notifications.api";
import { notificationKeys } from "../queries/use-notifications";

export function useArchiveNotification(storeId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) =>
      notificationsApi.archive(storeId as string, notificationId),
    onSuccess: () => {
      if (!storeId) return;
      queryClient.invalidateQueries({ queryKey: notificationKeys.all(storeId) });
    },
  });
}
