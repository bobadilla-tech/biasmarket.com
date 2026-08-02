import { useQuery } from "@tanstack/react-query";
import { customerAuthApi } from "../api/customer-auth.api";

export const customerAuthKeys = {
  profile: (slug: string) => ["customer-auth", "profile", slug] as const,
};

// Session state can only be known by asking the API (the session cookie is
// HttpOnly) — a failed request just means "not logged in", not an error to
// surface, so this never retries.
export function useCustomerProfile(slug: string) {
  return useQuery({
    queryKey: customerAuthKeys.profile(slug),
    queryFn: () => customerAuthApi.me(slug),
    retry: false,
  });
}
