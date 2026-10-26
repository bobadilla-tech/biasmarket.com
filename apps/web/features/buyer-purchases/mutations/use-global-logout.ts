import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { globalAccountKeys } from "../queries/use-global-account";

export function useGlobalLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.globalAccount.logout(),
    onSuccess: () => {
      // The buyer session is one cookie shared by every store, so the
      // per-store profile caches must forget it too.
      queryClient.removeQueries({ queryKey: ["customer-auth"] });
      queryClient.removeQueries({ queryKey: globalAccountKeys.orders });
      queryClient.invalidateQueries({ queryKey: globalAccountKeys.profile });
    },
  });
}
