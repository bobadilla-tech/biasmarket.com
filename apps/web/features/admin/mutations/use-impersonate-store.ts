"use client";

import { useMutation } from "@tanstack/react-query";
import { authClient } from "@/lib/auth-client";

// A single better-auth client call — no api/ wrapper, same precedent as
// features/auth/components/login-form.tsx's direct authClient.signIn.email
// call. Callers can read `mutation.variables` to know which userId is
// currently being impersonated (only one impersonation can be in flight).
export function useImpersonateStore() {
  return useMutation({
    mutationFn: (userId: string) => authClient.admin.impersonateUser({ userId }),
  });
}
