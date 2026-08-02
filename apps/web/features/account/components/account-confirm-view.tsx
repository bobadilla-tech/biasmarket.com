import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { SetPasswordForm } from "@/features/customer-auth";
import type { AccountOrder, ConfirmResult } from "../schemas/confirm-result.schema";

function statusLabel(
  status: AccountOrder["paymentStatus"],
  t: ReturnType<typeof useTranslations>,
) {
  if (status === "REJECTED") return t("status.rejected");
  if (status === "CANCELLED") return t("status.cancelled");
  if (status === "PARTIALLY_PAID") return t("status.partial");
  if (status === "VERIFIED") return t("status.verified");

  return t("status.toConfirm");
}

export function AccountConfirmView({
  slug,
  token,
  result,
}: {
  slug: string;
  token: string;
  result: ConfirmResult;
}) {
  const t = useTranslations("storefront.accountConfirmPage");

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="max-w-md mx-auto flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
          <p className="mt-1 text-sm text-gray-500">{result.customer.email}</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-3">
          <h2 className="text-sm font-semibold text-gray-900">{t("ordersTitle")}</h2>
          {result.orders.length === 0 ? (
            <p className="text-sm text-gray-500">{t("noOrders")}</p>
          ) : (
            result.orders.map((order) => (
              <div
                key={order.id}
                className="flex justify-between items-center border-t border-gray-100 pt-3 first:border-t-0 first:pt-0"
              >
                <div>
                  <p className="text-sm font-medium text-gray-900">#{order.id.slice(0, 8)}</p>
                  <p className="text-xs text-gray-500">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900">
                    {order.currency} {order.totalAmount}
                  </p>
                  <p className="text-xs text-gray-500">{statusLabel(order.paymentStatus, t)}</p>
                </div>
              </div>
            ))
          )}
        </div>

        <SetPasswordForm slug={slug} token={token} />

        <Link href={`/store/${slug}`} className="store-theme-link text-center font-semibold">
          {t("backToStore")}
        </Link>
      </div>
    </div>
  );
}
