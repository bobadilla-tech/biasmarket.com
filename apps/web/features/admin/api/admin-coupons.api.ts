function apiUrl() {
  return process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL;
}

export const adminCouponsApi = {
  list(fallbackErrorMessage?: string) {
    return fetch(`${apiUrl()}/api/admin/coupons`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    }).then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          data?.message ?? fallbackErrorMessage ?? "Network error",
        );
      }
      return data as Array<{
        id: string;
        code: string;
        name: string;
        description: string;
        plan: string;
        durationDays: number;
        maxUses: number;
        isActive: boolean;
        status: "active" | "inactive" | "expired";
        startsAt: string | null;
        expiresAt: string | null;
        createdAt: string;
        updatedAt: string;
        redemptionCount: number;
      }>;
    });
  },

  create(
    values: {
      code: string;
      name: string;
      description?: string;
      durationDays?: number;
      maxUses?: number;
      startsAt?: string;
      expiresAt?: string;
      isActive?: boolean;
    },
    fallbackErrorMessage?: string,
  ) {
    return fetch(`${apiUrl()}/api/admin/coupons`, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(values),
    }).then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          data?.message ?? fallbackErrorMessage ?? "Network error",
        );
      }
      return data;
    });
  },

  update(
    couponId: string,
    values: {
      code?: string;
      name?: string;
      description?: string;
      startsAt?: string;
      expiresAt?: string;
      isActive?: boolean;
    },
    fallbackErrorMessage?: string,
  ) {
    return fetch(`${apiUrl()}/api/admin/coupons/${couponId}`, {
      method: "PATCH",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(values),
    }).then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          data?.message ?? fallbackErrorMessage ?? "Network error",
        );
      }
      return data;
    });
  },

  toggleStatus(couponId: string, fallbackErrorMessage?: string) {
    return fetch(`${apiUrl()}/api/admin/coupons/${couponId}/status`, {
      method: "PATCH",
      credentials: "include",
      headers: { Accept: "application/json" },
    }).then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          data?.message ?? fallbackErrorMessage ?? "Network error",
        );
      }
      return data;
    });
  },

  delete(couponId: string, fallbackErrorMessage?: string) {
    return fetch(`${apiUrl()}/api/admin/coupons/${couponId}`, {
      method: "DELETE",
      credentials: "include",
      headers: { Accept: "application/json" },
    }).then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          data?.message ?? fallbackErrorMessage ?? "Network error",
        );
      }
      return data;
    });
  },

  listRedemptions(couponId: string, fallbackErrorMessage?: string) {
    return fetch(`${apiUrl()}/api/admin/coupons/${couponId}/redemptions`, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" },
    }).then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          data?.message ?? fallbackErrorMessage ?? "Network error",
        );
      }
      return data as Array<{
        id: string;
        couponId: string;
        userId: string;
        userEmail: string;
        userName: string;
        storeSlug: string | null;
        redeemedAt: string;
        expiresAt: string;
      }>;
    });
  },

  unredeem(
    couponId: string,
    redemptionId: string,
    fallbackErrorMessage?: string,
  ) {
    return fetch(
      `${apiUrl()}/api/admin/coupons/${couponId}/redemptions/${redemptionId}/unredeem`,
      {
        method: "POST",
        credentials: "include",
        headers: { Accept: "application/json" },
      },
    ).then(async (res) => {
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(
          data?.message ?? fallbackErrorMessage ?? "Network error",
        );
      }
      return data as { unredeemed: boolean };
    });
  },
};
