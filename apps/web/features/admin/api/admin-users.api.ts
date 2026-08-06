import { apiClient } from "@/lib/api-client";

// listUsers/banUser/unbanUser stay direct authClient calls in the query/
// mutation hooks — better-auth's admin client already returns typed data,
// no need to force validation onto a response this feature doesn't control
// the shape of. This file only owns the one Users-tag call.
export const adminUsersApi = {
  getStoreCounts(fallbackErrorMessage?: string) {
    return apiClient.users.getStoreCounts({ fallbackErrorMessage });
  },
};
