"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import {
  AdminCouponsTable,
  useAdminCoupons,
  useCouponRedemptions,
  useCreateCoupon,
} from "@/features/admin";
import {
  couponFormSchema,
  type CouponFormValues,
  type CouponRedemption,
} from "@/features/admin/schemas/coupon.schema";

export function AdminCouponsPageClient() {
  const t = useTranslations("admin.coupons");
  const tCommon = useTranslations("common");
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null);
  const couponsQuery = useAdminCoupons(tCommon("networkError"));
  const createCoupon = useCreateCoupon(tCommon("networkError"));
  const redemptionsQuery = useCouponRedemptions(
    selectedCouponId,
    tCommon("networkError"),
  );

  const coupons = couponsQuery.data ?? [];
  const redemptionsByCoupon = useMemo<
    Record<string, CouponRedemption[]>
  >(() => {
    const map: Record<string, CouponRedemption[]> = {};
    if (selectedCouponId && redemptionsQuery.data) {
      map[selectedCouponId] = redemptionsQuery.data as CouponRedemption[];
    }
    return map;
  }, [redemptionsQuery.data, selectedCouponId]);

  const form = useForm({
    resolver: zodResolver(couponFormSchema),
    defaultValues: {
      code: "",
      name: "",
      description: "",
      durationDays: 30,
      maxUses: 1,
      startsAt: "",
      expiresAt: "",
      isActive: true,
    },
  });

  const handleSubmit = form.handleSubmit(async (values: CouponFormValues) => {
    await createCoupon.mutateAsync(values);
    form.reset({
      code: "",
      name: "",
      description: "",
      durationDays: 30,
      maxUses: 1,
      startsAt: "",
      expiresAt: "",
      isActive: true,
    });
  });

  const error =
    couponsQuery.error instanceof Error
      ? couponsQuery.error.message
      : createCoupon.error instanceof Error
        ? createCoupon.error.message
        : null;

  if (couponsQuery.isPending) {
    return (
      <div className="px-6 py-10 text-sm text-gray-500">
        {tCommon("loading")}
      </div>
    );
  }

  return (
    <div className="bg-gray-50 px-6 py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>

        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-gray-900">
            {t("createTitle")}
          </h2>
          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-gray-700">
              <span>{t("form.code")}</span>
              <input
                {...form.register("code")}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-gray-700">
              <span>{t("form.name")}</span>
              <input
                {...form.register("name")}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-gray-700 md:col-span-2">
              <span>{t("form.description")}</span>
              <input
                {...form.register("description")}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-gray-700">
              <span>{t("form.durationDays")}</span>
              <input
                type="number"
                min={1}
                {...form.register("durationDays")}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-gray-700">
              <span>{t("form.maxUses")}</span>
              <input
                type="number"
                min={1}
                {...form.register("maxUses")}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-gray-700">
              <span>{t("form.startsAt")}</span>
              <input
                type="datetime-local"
                {...form.register("startsAt")}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm text-gray-700">
              <span>{t("form.expiresAt")}</span>
              <input
                type="datetime-local"
                {...form.register("expiresAt")}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700 md:col-span-2">
              <input
                type="checkbox"
                {...form.register("isActive")}
                className="h-4 w-4"
              />
              <span>{t("form.active")}</span>
            </label>

            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={createCoupon.isPending}
                className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-700 disabled:opacity-60"
              >
                {createCoupon.isPending ? tCommon("loading") : t("form.submit")}
              </button>
            </div>
          </form>
        </section>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {!error && coupons.length === 0 && (
          <p className="text-sm text-gray-500">{t("empty")}</p>
        )}

        {coupons.length > 0 && (
          <>
            <AdminCouponsTable
              coupons={coupons}
              redemptionsByCoupon={redemptionsByCoupon}
              selectedCouponId={selectedCouponId}
              onSelectCoupon={setSelectedCouponId}
            />

            {selectedCouponId && (
              <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-lg font-semibold text-gray-900">
                  {t("redemptions.title")}
                </h2>
                {redemptionsQuery.isPending && (
                  <p className="text-sm text-gray-500">{tCommon("loading")}</p>
                )}
                {redemptionsQuery.error instanceof Error && (
                  <p className="text-sm text-red-500">
                    {redemptionsQuery.error.message}
                  </p>
                )}
                {!redemptionsQuery.isPending &&
                  !redemptionsQuery.error &&
                  (!redemptionsQuery.data ||
                    redemptionsQuery.data.length === 0) && (
                    <p className="text-sm text-gray-500">
                      {t("redemptions.empty")}
                    </p>
                  )}
                {redemptionsQuery.data && redemptionsQuery.data.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                          <th className="px-4 py-3 font-medium">
                            {t("redemptions.user")}
                          </th>
                          <th className="px-4 py-3 font-medium">
                            {t("redemptions.email")}
                          </th>
                          <th className="px-4 py-3 font-medium">
                            {t("redemptions.redeemedAt")}
                          </th>
                          <th className="px-4 py-3 font-medium">
                            {t("redemptions.expiresAt")}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {redemptionsQuery.data.map((row) => (
                          <tr
                            key={row.id}
                            className="border-b border-gray-100 last:border-0"
                          >
                            <td className="px-4 py-3 text-gray-900">
                              {row.userName || "—"}
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {row.userEmail}
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {new Date(row.redeemedAt).toLocaleString()}
                            </td>
                            <td className="px-4 py-3 text-gray-600">
                              {new Date(row.expiresAt).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
