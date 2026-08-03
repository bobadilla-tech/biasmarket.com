import { apiFetch } from "@/lib/api";
import { adminStoreListSchema } from "../schemas/admin-store.schema";

// Impersonation goes through authClient.admin.impersonateUser directly
// (better-auth client call, same precedent as features/auth's login-form.tsx)
// — not wrapped here, this file only owns the one apiFetch-backed endpoint.
export const adminStoresApi = {
  async list(fallbackErrorMessage?: string) {
    const data = await apiFetch("/stores", {}, fallbackErrorMessage);
    return adminStoreListSchema.parse(data);
  },
};
