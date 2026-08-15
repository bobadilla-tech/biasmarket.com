"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import {
  AdminCouponsTable,
  CouponFormDialog,
  CouponRedemptionsTable,
  useAdminCoupons,
  useCouponRedemptions,
  useCreateCoupon,
  useDeleteCoupon,
  useToggleCouponStatus,
  useUpdateCoupon,
} from "@/features/admin";
import type { CouponFormValues } from "@/features/admin/schemas/coupon.schema";

export function AdminCouponsPageClient() {
  const t = useTranslations("admin.coupons");
  const tCommon = useTranslations("common");
  const [formOpen, setFormOpen] = useState(false);
  const [editingCouponId, setEditingCouponId] = useState<string | null>(null);
  const [selectedCouponId, setSelectedCouponId] = useState<string | null>(null);

  const couponsQuery = useAdminCoupons(tCommon("networkError"));
  const createCoupon = useCreateCoupon(tCommon("networkError"));
  const updateCoupon = useUpdateCoupon(tCommon("networkError"));
  const toggleCouponStatus = useToggleCouponStatus(tCommon("networkError"));
  const deleteCoupon = useDeleteCoupon(tCommon("networkError"));
  const redemptionsQuery = useCouponRedemptions(
    selectedCouponId,
    tCommon("networkError"),
  );

  const coupons = couponsQuery.data ?? [];

  const editingCoupon = editingCouponId
    ? (coupons.find((c) => c.id === editingCouponId) ?? null)
    : null;

  const formInitialValues: CouponFormValues | undefined = editingCoupon
    ? {
        code: editingCoupon.code,
        name: editingCoupon.name,
        description: editingCoupon.description ?? "",
        maxUses: editingCoupon.maxUses,
        startsAt: editingCoupon.startsAt
          ? editingCoupon.startsAt.slice(0, 10)
          : "",
        expiresAt: editingCoupon.expiresAt
          ? editingCoupon.expiresAt.slice(0, 10)
          : "",
      }
    : undefined;

  const openCreateForm = () => {
    setEditingCouponId(null);
    setFormOpen(true);
  };

  const handleEdit = (coupon: (typeof coupons)[number]) => {
    setEditingCouponId(coupon.id);
    setFormOpen(true);
  };

  // Toggles the inline redemptions section: clicking a coupon that is not
  // selected shows its redemptions; clicking the already-selected one hides
  // them again.
  const handleSelectCoupon = (couponId: string) => {
    setSelectedCouponId((current) => (current === couponId ? null : couponId));
  };

  const handleFormClose = () => {
    setFormOpen(false);
    setEditingCouponId(null);
  };

  const handleSubmit = async (values: CouponFormValues) => {
    if (editingCouponId) {
      await updateCoupon.mutateAsync({
        couponId: editingCouponId,
        values,
      });
    } else {
      await createCoupon.mutateAsync(values);
    }
    handleFormClose();
  };

  const handleDelete = async (couponId: string) => {
    // Deleting a coupon cascades away every CouponRedemption row for it (see
    // the schema's onDelete: Cascade) — there's no soft-delete, so this is
    // the only guard against losing that audit trail by accident.
    if (!globalThis.confirm(t("confirmDelete"))) return;
    await deleteCoupon.mutateAsync(couponId);
    if (selectedCouponId === couponId) {
      setSelectedCouponId(null);
    }
  };

  const handleToggleStatus = async (couponId: string) => {
    await toggleCouponStatus.mutateAsync(couponId);
  };

  const handleUnredeemed = (redemptionId: string) => {
    // Refetch handled by the mutation's query cache invalidation. If the
    // last redemption for the selected coupon was removed, close the section.
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
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <button
            type="button"
            onClick={openCreateForm}
            className="rounded-xl bg-gray-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-gray-700"
          >
            New coupon
          </button>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {!error && coupons.length === 0 && (
          <p className="text-sm text-gray-500">{t("empty")}</p>
        )}

        {coupons.length > 0 && (
          <>
            <AdminCouponsTable
              coupons={coupons}
              selectedCouponId={selectedCouponId}
              onSelectCoupon={handleSelectCoupon}
              onEdit={handleEdit}
              onToggleStatus={handleToggleStatus}
              onDelete={handleDelete}
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
                  redemptionsQuery.data && (
                    <CouponRedemptionsTable
                      couponId={selectedCouponId}
                      redemptions={redemptionsQuery.data}
                      onUnredeemed={handleUnredeemed}
                    />
                  )}
              </section>
            )}
          </>
        )}
      </div>

      <CouponFormDialog
        open={formOpen}
        initialValues={formInitialValues}
        isSubmitting={createCoupon.isPending || updateCoupon.isPending}
        submitLabel={editingCouponId ? "Save changes" : t("form.submit")}
        onClose={handleFormClose}
        onSubmit={handleSubmit}
      />
    </div>
  );
}
