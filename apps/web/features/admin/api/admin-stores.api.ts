import { apiClient } from "@/lib/api-client";

// Impersonation goes through authClient.admin.impersonateUser directly
// (better-auth client call, same precedent as features/auth's login-form.tsx)
// — not wrapped here, this file only owns the one endpoint.
export const adminStoresApi = {
  list(fallbackErrorMessage?: string) {
    return apiClient.stores.findAllForAdmin({ fallbackErrorMessage });
  },
};
