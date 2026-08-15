"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { AdminCoupon } from "../schemas/coupon.schema";

interface AdminCouponsTableProps {
  coupons: AdminCoupon[];
  onSelectCoupon: (couponId: string) => void;
  selectedCouponId: string | null;
  onEdit: (coupon: AdminCoupon) => void;
  onToggleStatus: (couponId: string) => void;
  onDelete: (couponId: string) => void;
}

export function AdminCouponsTable({
  coupons,
  onSelectCoupon,
  selectedCouponId,
  onEdit,
  onToggleStatus,
  onDelete,
}: AdminCouponsTableProps) {
  const t = useTranslations("admin.coupons");
  const [openMenuCouponId, setOpenMenuCouponId] = useState<string | null>(null);

  const closeMenu = () => setOpenMenuCouponId(null);

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
            const statusLabel =
              coupon.status === "expired"
                ? t("status.expired")
                : coupon.status === "active"
                  ? t("status.active")
                  : coupon.status === "scheduled"
                    ? t("status.scheduled")
                    : t("status.inactive");

            return (
              <tr
                key={coupon.id}
                className={`border-b border-gray-100 align-top last:border-0 ${
                  isSelected ? "bg-amber-50/50" : ""
                }`}
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
                  {coupon.status === "active" ? (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                      {statusLabel}
                    </span>
                  ) : coupon.status === "expired" ? (
                    <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700">
                      {statusLabel}
                    </span>
                  ) : (
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-700">
                      {statusLabel}
                    </span>
                  )}
                </td>
                <td className="px-6 py-3 text-gray-600">
                  {coupon.durationDays}d
                </td>
                <td className="px-6 py-3 text-gray-600">
                  {coupon.redemptionCount}/{coupon.maxUses}
                </td>
                <td className="px-6 py-3 text-gray-600">
                  {new Date(coupon.createdAt).toLocaleDateString()}
                </td>
                <td className="px-6 py-3">
                  <Popover
                    open={openMenuCouponId === coupon.id}
                    onOpenChange={(open) =>
                      setOpenMenuCouponId(open ? coupon.id : null)
                    }
                  >
                    <PopoverTrigger
                      type="button"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-gray-200 text-gray-600 transition hover:bg-gray-50"
                      aria-label="Open actions menu"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-44 p-1">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectCoupon(coupon.id);
                          closeMenu();
                        }}
                        className="w-full rounded-md px-3 py-2 text-left text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                      >
                        {isSelected ? "Hide redemptions" : "View redemptions"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onEdit(coupon);
                          closeMenu();
                        }}
                        className="w-full rounded-md px-3 py-2 text-left text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onToggleStatus(coupon.id);
                          closeMenu();
                        }}
                        className="w-full rounded-md px-3 py-2 text-left text-xs font-semibold text-gray-700 transition hover:bg-gray-50"
                      >
                        {coupon.status === "active" ? "Deactivate" : "Activate"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          onDelete(coupon.id);
                          closeMenu();
                        }}
                        className="w-full rounded-md px-3 py-2 text-left text-xs font-semibold text-red-700 transition hover:bg-red-50"
                      >
                        Delete
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
