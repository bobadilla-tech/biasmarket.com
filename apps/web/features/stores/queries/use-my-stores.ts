"use client";

import { useQuery } from "@tanstack/react-query";
import { storesApi } from "../api/stores.api";
import { authClient } from "@/lib/auth-client";

export function useMyStores(options?: { enabled?: boolean }) {
  const { data: session } = authClient.useSession();
  const userId = session?.user?.id ?? "anonymous";

  return useQuery({
    queryKey: ["stores", "mine", userId],
    queryFn: storesApi.listMine,
    enabled: options?.enabled,
  });
}
