"use client";

import { authClient } from "@/lib/auth-client";

export interface UserPlanInfo {
  plan: string;
  premiumUntil: string | null;
  isPremium: boolean;
}

// Reads plan/premiumUntil off the cached better-auth session — fine today
// because nothing here is a real authorization decision (the backend
// re-verifies premiumUntil from the DB on every write, never trusts a
// cached session value) and no cookie-cache/JWT plugin is configured, so
// session reads hit the DB fresh too. If a future feature gates access on
// this hook client-side without a server-side re-check, or cookie caching
// gets enabled later, this becomes a real staleness/bypass path — re-check
// this assumption before doing either.
export function useUserPlan(): UserPlanInfo {
  const { data: session } = authClient.useSession();
  const user = session?.user as
    | (Partial<Record<"plan" | "premiumUntil", unknown>> & {
        plan?: string | null;
        premiumUntil?: string | null;
      })
    | undefined;

  const plan = user?.plan ?? "basic";
  const premiumUntilRaw = user?.premiumUntil ?? null;
  const premiumUntil =
    typeof premiumUntilRaw === "string" && premiumUntilRaw
      ? new Date(premiumUntilRaw)
      : null;

  const isPremium =
    plan === "premium" && (premiumUntil === null || premiumUntil > new Date());

  return {
    plan,
    premiumUntil: premiumUntil?.toISOString() ?? null,
    isPremium,
  };
}
