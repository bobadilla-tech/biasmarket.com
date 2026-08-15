"use client";

import { useQueryClient } from "@tanstack/react-query";
import { MoreHorizontal } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { CouponRedemption } from "../schemas/coupon.schema";
import { useUnredeemCoupon } from "../mutations/use-unredeem-coupon";
import {
  clearImpersonationHistory,
  setImpersonationHistory,
} from "@/lib/impersonation-history";
import { authClient } from "@/lib/auth-client";

interface CouponRedemptionsTableProps {
  couponId: string;
  redemptions: CouponRedemption[];
  onUnredeemed: (redemptionId: string) => void;
}

export function CouponRedemptionsTable({
  couponId,
  redemptions,
  onUnredeemed,
}: CouponRedemptionsTableProps) {
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

  if (redemptions.length === 0) {
    return <p className="text-sm text-gray-500">No redemptions yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
            <th className="px-4 py-3 font-medium">User</th>
            <th className="px-4 py-3 font-medium">Email</th>
            <th className="px-4 py-3 font-medium">Redeemed</th>
            <th className="px-4 py-3 font-medium">Premium until</th>
            <th className="px-4 py-3 font-medium">Actions</th>
          </tr>
        </thead>
        <tbody>
          {redemptions.map((row) => {
            const pendingUnredeem = unredeem.isPending &&
              unredeem.variables?.redemptionId === row.id;

            return (
              <tr
                key={row.id}
                className="border-b border-gray-100 last:border-0"
              >
                <td className="px-4 py-3 font-medium text-gray-900">
                  {row.userName || "—"}
                </td>
                <td className="px-4 py-3 text-gray-600">{row.userEmail}</td>
                <td className="px-4 py-3 text-gray-600">
                  {new Date(row.redeemedAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 text-gray-600">
                  {new Date(row.expiresAt).toLocaleString()}
                </td>
                <td className="px-4 py-3">
                  <Popover>
                    <PopoverTrigger
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50"
                      aria-label="Open actions menu"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-40 p-1">
                      <button
                        type="button"
                        onClick={() => handleImpersonate(row)}
                        className="w-full rounded-md px-3 py-2 text-left text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                      >
                        Impersonate
                      </button>
                      <button
                        type="button"
                        disabled={pendingUnredeem}
                        onClick={() => handleUnredeem(row)}
                        className="w-full rounded-md px-3 py-2 text-left text-xs font-semibold text-red-700 transition hover:bg-red-50 disabled:opacity-60"
                      >
                        {pendingUnredeem ? "Un-redeeming…" : "Un-redeem"}
                      </button>
                    </PopoverContent>
                  </Popover>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
