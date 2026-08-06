"use client";

import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import type {
  AccountOrderResponseDto,
  CustomerProfileResponseDto,
} from "@biasmarket/types";
import { useCustomerLogout } from "../mutations/use-customer-logout";
import { CustomerChangePasswordForm } from "./customer-change-password-form";
import { EditContactForm } from "./edit-contact-form";

function statusLabel(
  status: AccountOrderResponseDto["paymentStatus"],
  t: ReturnType<typeof useTranslations>,
) {
  if (status === "REJECTED") return t("status.rejected");
  if (status === "CANCELLED") return t("status.cancelled");
  if (status === "PARTIALLY_PAID") return t("status.partial");
  if (status === "VERIFIED") return t("status.verified");

  return t("status.toConfirm");
}

export function CustomerProfileView(
  { slug, profile }: { slug: string; profile: CustomerProfileResponseDto },
) {
  const t = useTranslations("storefront.accountPage");
  const router = useRouter();
  const logout = useCustomerLogout(slug);

  const handleLogout = async () => {
    await logout.mutateAsync();
    router.push(`/store/${slug}`);
  };

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="max-w-md mx-auto flex flex-col gap-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
            <p className="mt-1 text-sm text-gray-500">
              {profile.customer.phone}
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            disabled={logout.isPending}
            className="text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-60"
          >
            {t("logout")}
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-gray-900">
            {t("infoTitle")}
          </h2>
          <p className="text-sm text-gray-600">
            {profile.customer.name ?? t("noName")}
          </p>
          <p className="text-sm text-gray-600">
            {profile.customer.email ?? t("noEmail")}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-gray-900">
            {t("ordersTitle")}
          </h2>
          {profile.orders.length === 0
            ? <p className="text-sm text-gray-500">{t("noOrders")}</p>
            : (
              profile.orders.map((order) => (
                <div
                  key={order.id}
                  className="flex justify-between items-center border-t border-gray-100 pt-3 first:border-t-0 first:pt-0"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      #{order.id.slice(0, 8)}
                    </p>
                    <p className="text-xs text-gray-500">
                      {new Date(order.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900">
                      {order.currency} {order.totalAmount}
                    </p>
                    <p className="text-xs text-gray-500">
                      {statusLabel(order.paymentStatus, t)}
                    </p>
                  </div>
                </div>
              ))
            )}
        </div>

        <EditContactForm slug={slug} profile={profile} />

        <CustomerChangePasswordForm slug={slug} />

        <Link
          href={`/store/${slug}`}
          className="store-theme-link text-center font-semibold"
        >
          {t("backToStore")}
        </Link>
      </div>
    </div>
  );
}
