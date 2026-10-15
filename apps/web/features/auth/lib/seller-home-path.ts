import { storesApi } from "@/features/stores";

// Where a freshly authenticated seller lands — shared by password login and
// the post-email-verification auto sign-in so both flows agree. First-time
// sellers (no store yet) still go through first-store onboarding; returning
// sellers skip it — onboarding is a one-time setup flow, not the permanent
// post-login landing page.
export async function resolveSellerHomePath(
  role: string | null | undefined,
): Promise<string> {
  if (role === "admin") return "/admin";

  const stores = await storesApi.listMine();
  if (stores.length === 0) return "/onboarding/create-store";
  if (stores.length === 1) return `/dashboard/${stores[0].slug}`;
  return "/account";
}
