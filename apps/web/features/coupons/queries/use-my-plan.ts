"use client";

import { authClient } from "@/lib/auth-client";

export interface UserPlanInfo {
  plan: string;
  premiumUntil: string | null;
  isPremium: boolean;
}

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
  const premiumUntil = typeof premiumUntilRaw === "string" && premiumUntilRaw
    ? new Date(premiumUntilRaw)
    : null;

  const isPremium = plan === "premium" &&
    (premiumUntil === null || premiumUntil > new Date());

  return {
    plan,
    premiumUntil: premiumUntil?.toISOString() ?? null,
    isPremium,
  };
}
