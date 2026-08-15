"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@/i18n/navigation";
import type { CouponRedemption } from "../schemas/coupon.schema";
import { useUnredeemCoupon } from "../mutations/use-unredeem-coupon";
import {
  clearImpersonationHistory,
  setImpersonationHistory,
} from "@/lib/impersonation-history";
import { authClient } from "@/lib/auth-client";

interface CouponRedemptionsDialogProps {
  couponId: string;
  couponName: string;
  redemptions: CouponRedemption[];
  onClose: () => void;
  onUnredeemed: (redemptionId: string) => void;
}

export function CouponRedemptionsDialog({
  couponId,
  couponName,
  redemptions,
  onClose,
  onUnredeemed,
}: CouponRedemptionsDialogProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const unredeem = useUnredeemCoupon();

  const handleImpersonate = async (row: CouponRedemption) => {
    // Impersonate the user account itself (not a store) and land on that
    // user's account page. This reuses the same better-auth foundation as
    // store impersonation, keyed on the redeemed user's id.
    const path = `/account`;

    setImpersonationHistory({
      userId: row.userId,
      path,
      active: false,
    });

    try {
      const res = await authClient.admin.impersonateUser({
        userId: row.userId,
      });
      if (res.error) {
        clearImpersonationHistory();
        return;
      }
      setImpersonationHistory({ userId: row.userId, path, active: true });
      await queryClient.invalidateQueries();
      router.push(path);
    } catch {
      clearImpersonationHistory();
    }
  };

  const handleUnredeem = async (row: CouponRedemption) => {
    await unredeem.mutateAsync({
      couponId,
      redemptionId: row.id,
    });
    onUnredeemed(row.id);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h2 className="text-base font-semibold text-gray-900">
            Redemptions · {couponName}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-gray-500 transition hover:bg-gray-100"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {unredeem.error instanceof Error && (
          <p className="border-b border-red-100 bg-red-50 px-5 py-2 text-sm text-red-600">
            {unredeem.error.message}
          </p>
        )}

        <div className="overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                <th className="px-5 py-3 font-medium">User</th>
                <th className="px-5 py-3 font-medium">Email</th>
                <th className="px-5 py-3 font-medium">Redeemed</th>
                <th className="px-5 py-3 font-medium">Premium until</th>
                <th className="px-5 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {redemptions.map((row) => {
                const pendingUnredeem =
                  unredeem.isPending &&
                  unredeem.variables?.redemptionId === row.id;

                return (
                  <tr
                    key={row.id}
                    className="border-b border-gray-100 last:border-0"
                  >
                    <td className="px-5 py-3 font-medium text-gray-900">
                      {row.userName || "—"}
                    </td>
                    <td className="px-5 py-3 text-gray-600">{row.userEmail}</td>
                    <td className="px-5 py-3 text-gray-600">
                      {new Date(row.redeemedAt).toLocaleString()}
                    </td>
                    <td className="px-5 py-3 text-gray-600">
                      {new Date(row.expiresAt).toLocaleString()}
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => handleImpersonate(row)}
                          className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                        >
                          Impersonate
                        </button>
                        <button
                          type="button"
                          disabled={pendingUnredeem}
                          onClick={() => handleUnredeem(row)}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                        >
                          {pendingUnredeem ? "Un-redeeming…" : "Un-redeem"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
