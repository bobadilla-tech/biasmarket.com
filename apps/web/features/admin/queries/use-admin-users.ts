"use client";

import { useQuery } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";
import { adminUsersApi } from "../api/admin-users.api";
import type { AdminUser } from "../schemas/admin-user.schema";

export const adminUsersKeys = {
  all: ["admin-users"] as const,
};

export function useAdminUsers(fallbackErrorMessage?: string) {
  return useQuery({
    queryKey: adminUsersKeys.all,
    queryFn: async () => {
      const [usersResult, counts] = await Promise.all([
        authClient.admin.listUsers({
          query: { limit: 100, sortBy: "createdAt", sortDirection: "desc" },
        }),
        adminUsersApi.getStoreCounts(fallbackErrorMessage),
      ]);
      if (usersResult.error) {
        throw new Error(
          usersResult.error.message ?? fallbackErrorMessage ?? "Network error",
        );
      }
      return {
        users: (usersResult.data?.users ?? []) as AdminUser[],
        storeCounts: Object.fromEntries(
          counts.map((c) => [c.userId, c.storeCount]),
        ) as Record<
          string,
          number
        >,
      };
    },
  });
}
