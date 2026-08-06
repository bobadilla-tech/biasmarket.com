import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";

export const accountKeys = {
  confirm: (slug: string, token: string | null) =>
    ["account", "confirm", slug, token] as const,
};

export function useConfirmAccount(slug: string, token: string | null) {
  return useQuery({
    queryKey: accountKeys.confirm(slug, token),
    queryFn: () =>
      apiClient.customerAccount.confirm(slug, { token: token as string }),
    enabled: !!token,
  });
}
