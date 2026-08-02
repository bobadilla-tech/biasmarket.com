import { apiFetch } from "@/lib/api";
import { storeCountListSchema } from "../schemas/admin-user.schema";

// listUsers/banUser/unbanUser stay direct authClient calls in the query/
// mutation hooks — better-auth's admin client already returns typed data,
// no need to force zod validation onto a response this feature doesn't
// control the shape of. This file only owns the one apiFetch-backed call.
export const adminUsersApi = {
  async getStoreCounts(fallbackErrorMessage?: string) {
    const data = await apiFetch("/admin/users/store-counts", {}, fallbackErrorMessage);
    return storeCountListSchema.parse(data);
  },
};
