"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { useRedeemCoupon } from "../mutations/use-redeem-coupon";
import { useUserPlan } from "../queries/use-my-plan";
import {
  redeemCouponSchema,
  type RedeemCouponValues,
} from "../schemas/redeem-coupon.schema";

interface RedeemCouponSectionProps {
  onRedeemed?: (expiresAt: string) => void;
}

export function RedeemCouponSection({ onRedeemed }: RedeemCouponSectionProps) {
  const t = useTranslations("coupons.redeem");
  const locale = useLocale();
  const { isPremium, premiumUntil } = useUserPlan();
  const redeem = useRedeemCoupon();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<RedeemCouponValues>({
    resolver: zodResolver(redeemCouponSchema),
    defaultValues: { code: "" },
  });

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString(locale, {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

  // Maps backend coupon error messages (thrown by CouponsService) to the
  // corresponding i18n key. Falls back to a generic error for anything unknown.
  const errorMessageKey = (raw: string) => {
    const key = {
      "Coupon not found": t("errors.notFound"),
      "Coupon is inactive": t("errors.inactive"),
      "Coupon is not available yet": t("errors.notAvailable"),
      "Coupon has expired": t("errors.expired"),
      "This user already redeemed this coupon": t("errors.alreadyRedeemed"),
      "Coupon has reached its maximum uses": t("errors.maxUses"),
    }[raw];

    return key ?? t("errors.generic");
  };

  const onSubmit = async (values: RedeemCouponValues) => {
    try {
      const result = await redeem.mutateAsync(values.code.trim().toUpperCase());
      toast.success(t("success", { date: formatDate(result.expiresAt) }));
      onRedeemed?.(result.expiresAt);
      reset();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      toast.error(errorMessageKey(message));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {isPremium && premiumUntil && (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
          {t("premiumUntil", { date: formatDate(premiumUntil) })}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <input
            {...register("code")}
            aria-label={t("placeholder")}
            placeholder={t("placeholder")}
            maxLength={8}
            className="w-full rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 uppercase outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
          {errors.code && (
            <p className="text-sm text-red-500">{errors.code.message}</p>
          )}
        </div>
        <button
          type="submit"
          disabled={redeem.isPending}
          className="w-full rounded-xl bg-emerald-500 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
        >
          {redeem.isPending ? t("redeeming") : t("redeem")}
        </button>
      </form>
    </div>
  );
}
