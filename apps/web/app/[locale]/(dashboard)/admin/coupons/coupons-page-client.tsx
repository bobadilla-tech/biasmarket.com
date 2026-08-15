"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import {
  AdminCouponsTable,
  CouponRedemptionsDialog,
  useAdminCoupons,
  useCouponRedemptions,
  useCreateCoupon,
  useDeleteCoupon,
  useToggleCouponStatus,
  useUpdateCoupon,
} from "@/features/admin";
import {
  couponFormSchema,
  type CouponFormValues,
  type CouponRedemption,
} from "@/features/admin/schemas/coupon.schema";

const blankFormValues: CouponFormValues = {
  code: "",
  name: "",
  description: "",
  maxUses: 1,
  startsAt: "",
  expiresAt: "",
};

export function AdminCouponsPageClient() {
  const t = useTranslations("admin.coupons");
  const tCommon = useTranslations("common");
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null);
  const [editingCouponId, setEditingCouponId] = useState<string | null>(null);

  const couponsQuery = useAdminCoupons(tCommon("networkError"));
  const createCoupon = useCreateCoupon(tCommon("networkError"));
  const updateCoupon = useUpdateCoupon(tCommon("networkError"));
  const toggleCouponStatus = useToggleCouponStatus(tCommon("networkError"));
  const deleteCoupon = useDeleteCoupon(tCommon("networkError"));
  const redemptionsQuery = useCouponRedemptions(
    selectedCouponId,
    tCommon("networkError"),
  );

  const form = useForm<CouponFormValues>({
    resolver: zodResolver(couponFormSchema),
    defaultValues: blankFormValues,
  });

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

  const resetForm = () => {
    setEditingCouponId(null);
    form.reset(blankFormValues);
  };

  const handleEdit = (coupon: (typeof coupons)[number]) => {
    setEditingCouponId(coupon.id);
    form.reset({
      code: coupon.code,
      name: coupon.name,
      description: coupon.description ?? "",
      maxUses: coupon.maxUses,
      startsAt: coupon.startsAt ? coupon.startsAt.slice(0, 10) : "",
      expiresAt: coupon.expiresAt ? coupon.expiresAt.slice(0, 10) : "",
    });
  };

  const handleSubmit = form.handleSubmit(async (values) => {
    if (editingCouponId) {
      await updateCoupon.mutateAsync({
        couponId: editingCouponId,
        values,
      });
    } else {
      await createCoupon.mutateAsync(values);
    }
    resetForm();
  });

  const handleDelete = async (couponId: string) => {
    await deleteCoupon.mutateAsync(couponId);
    if (selectedCouponId === couponId) {
      setSelectedCouponId(null);
    }
  };

  const handleToggleStatus = async (couponId: string) => {
    await toggleCouponStatus.mutateAsync(couponId);
  };

  const selectedCoupon = selectedCouponId
    ? (coupons.find((c) => c.id === selectedCouponId) ?? null)
    : null;

  const handleUnredeemed = (redemptionId: string) => {
    // Refetch handled by the mutation's query cache invalidation. If the
    // dialog is showing the last remaining redemption, there is nothing to
    // list — close it.
    const remaining =
      redemptionsQuery.data?.filter((r) => r.id !== redemptionId) ?? [];
    if (remaining.length === 0) {
      setSelectedCouponId(null);
    }
  };

  const error =
    couponsQuery.error instanceof Error
      ? couponsQuery.error.message
      : createCoupon.error instanceof Error
        ? createCoupon.error.message
        : updateCoupon.error instanceof Error
          ? updateCoupon.error.message
          : toggleCouponStatus.error instanceof Error
            ? toggleCouponStatus.error.message
            : deleteCoupon.error instanceof Error
              ? deleteCoupon.error.message
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
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-gray-900">
              {editingCouponId ? "Edit coupon" : t("createTitle")}
            </h2>
            {editingCouponId && (
              <button
                type="button"
                onClick={resetForm}
                className="text-sm text-gray-600 underline"
              >
                Cancel
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className="grid gap-4 md:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm text-gray-700">
              <span>{t("form.code")}</span>
              <input
                {...form.register("code")}
                maxLength={8}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm uppercase"
                placeholder="PREMIUM"
              />
              {form.formState.errors.code && (
                <span className="text-xs text-red-500">
                  {form.formState.errors.code.message}
                </span>
              )}
            </label>

            <label className="flex flex-col gap-1 text-sm text-gray-700">
              <span>{t("form.name")}</span>
              <input
                {...form.register("name")}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
              {form.formState.errors.name && (
                <span className="text-xs text-red-500">
                  {form.formState.errors.name.message}
                </span>
              )}
            </label>

            <label className="flex flex-col gap-1 text-sm text-gray-700 md:col-span-2">
              <span>{t("form.description")}</span>
              <input
                {...form.register("description")}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
            </label>

            <label className="flex flex-col gap-1 text-sm text-gray-700">
              <span>{t("form.maxUses")}</span>
              <input
                type="number"
                min={1}
                {...form.register("maxUses", { valueAsNumber: true })}
                className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
              />
              {form.formState.errors.maxUses && (
                <span className="text-xs text-red-500">
                  {form.formState.errors.maxUses.message}
                </span>
              )}
            </label>

            <div className="md:col-span-2 grid gap-4 md:grid-cols-2">
              <label className="flex flex-col gap-1 text-sm text-gray-700">
                <span>{t("form.startsAt")}</span>
                <input
                  type="date"
                  {...form.register("startsAt")}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                />
              </label>

              <label className="flex flex-col gap-1 text-sm text-gray-700">
                <span>{t("form.expiresAt")}</span>
                <input
                  type="date"
                  {...form.register("expiresAt")}
                  className="rounded-xl border border-gray-200 px-3 py-2 text-sm"
                />
              </label>
            </div>

            <div className="md:col-span-2 flex items-center justify-between gap-3">
              <div className="text-sm text-gray-500">
                Premium plan: 30 days (1 month)
              </div>
              <button
                type="submit"
                disabled={createCoupon.isPending || updateCoupon.isPending}
                className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-700 disabled:opacity-60"
              >
                {createCoupon.isPending || updateCoupon.isPending
                  ? tCommon("loading")
                  : editingCouponId
                    ? "Save changes"
                    : t("form.submit")}
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
              onEdit={handleEdit}
              onToggleStatus={handleToggleStatus}
              onDelete={handleDelete}
            />

            {selectedCoupon && selectedCouponId && redemptionsQuery.data && (
              <CouponRedemptionsDialog
                couponId={selectedCouponId}
                couponName={selectedCoupon.name}
                redemptions={redemptionsQuery.data}
                onClose={() => setSelectedCouponId(null)}
                onUnredeemed={handleUnredeemed}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
