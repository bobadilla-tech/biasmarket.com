"use client";

import { useTranslations } from "next-intl";
import type { AdminCoupon, CouponRedemption } from "../schemas/coupon.schema";

interface AdminCouponsTableProps {
  coupons: AdminCoupon[];
  redemptionsByCoupon: Record<string, CouponRedemption[]>;
  onSelectCoupon: (couponId: string) => void;
  selectedCouponId: string | null;
}

export function AdminCouponsTable({
  coupons,
  redemptionsByCoupon,
  onSelectCoupon,
  selectedCouponId,
}: AdminCouponsTableProps) {
  const t = useTranslations("admin.coupons");
  const tCommon = useTranslations("common");

  return (
    <div className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
            <th className="px-6 py-3 font-medium">{t("table.code")}</th>
            <th className="px-6 py-3 font-medium">{t("table.name")}</th>
            <th className="px-6 py-3 font-medium">{t("table.status")}</th>
            <th className="px-6 py-3 font-medium">{t("table.duration")}</th>
            <th className="px-6 py-3 font-medium">{t("table.uses")}</th>
            <th className="px-6 py-3 font-medium">{t("table.created")}</th>
            <th className="px-6 py-3 font-medium">{t("table.actions")}</th>
          </tr>
        </thead>
        <tbody>
          {coupons.map((coupon) => {
            const isSelected = selectedCouponId === coupon.id;
            const redemptions = redemptionsByCoupon[coupon.id] ?? [];

            return (
              <tr
                key={coupon.id}
                className={`border-b border-gray-100 align-top last:border-0 ${isSelected ? "bg-amber-50/50" : ""}`}
              >
                <td className="px-6 py-3 font-semibold uppercase tracking-wide text-gray-900">
                  {coupon.code}
                </td>
                <td className="px-6 py-3 text-gray-700">
                  <div className="font-medium">{coupon.name}</div>
                  {coupon.description && (
                    <div className="mt-1 text-xs text-gray-500">
                      {coupon.description}
                    </div>
                  )}
                </td>
                <td className="px-6 py-3">
                  {coupon.isActive ? (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      {t("status.active")}
                    </span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
                      {t("status.inactive")}
                    </span>
                  )}
                </td>
                <td className="px-6 py-3 text-gray-600">
                  {coupon.durationDays}d
                </td>
                <td className="px-6 py-3 text-gray-600">
                  {redemptions.length}/{coupon.maxUses}
                </td>
                <td className="px-6 py-3 text-gray-600">
                  {new Date(coupon.createdAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-3">
                  <button
                    type="button"
                    onClick={() => onSelectCoupon(coupon.id)}
                    className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-gray-700"
                  >
                    {isSelected ? tCommon("loading") : "View redemptions"}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
