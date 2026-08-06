import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { notificationKeys } from "../queries/use-notifications";

export function useMarkRead(storeId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (notificationId: string) =>
      apiClient.notifications.markRead(storeId as string, notificationId),
    onSuccess: () => {
      if (!storeId) return;
      queryClient.invalidateQueries({
        queryKey: notificationKeys.all(storeId),
      });
    },
  });
}
