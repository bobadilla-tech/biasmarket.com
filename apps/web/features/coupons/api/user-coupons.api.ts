function apiUrl() {
  return process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL;
}

export interface RedeemCouponResult {
  id: string;
  couponId: string;
  userId: string;
  userEmail: string;
  userName: string;
  storeSlug: string | null;
  redeemedAt: string;
  expiresAt: string;
}

export const userCouponsApi = {
  redeem(code: string, fallbackErrorMessage?: string) {
    return fetch(`${apiUrl()}/api/coupons/redeem`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ code }),
    }).then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          data?.message ?? fallbackErrorMessage ?? "Network error",
        );
      }
      return data as RedeemCouponResult;
    });
  },
};
