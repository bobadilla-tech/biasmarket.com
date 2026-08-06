import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { notificationKeys } from "../queries/use-notifications";

export function useMarkAllRead(storeId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.notifications.markAllRead(storeId as string),
    onSuccess: () => {
      if (!storeId) return;
      queryClient.invalidateQueries({
        queryKey: notificationKeys.all(storeId),
      });
    },
  });
}
