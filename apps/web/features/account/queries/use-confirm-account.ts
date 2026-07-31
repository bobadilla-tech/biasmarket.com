import { useQuery } from "@tanstack/react-query";
import { accountApi } from "../api/account.api";

export const accountKeys = {
  confirm: (slug: string, token: string | null) =>
    ["account", "confirm", slug, token] as const,
};

export function useConfirmAccount(slug: string, token: string | null) {
  return useQuery({
    queryKey: accountKeys.confirm(slug, token),
    queryFn: () => accountApi.confirm(slug, token as string),
    enabled: !!token,
  });
}
