"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { useRelatedOrders } from "../queries/use-related-orders";

// "Otros pedidos de este numero": history of the same buyer number in this
// store, so the seller sees repeat buyers (and a mistyped number) at a glance.
// Rows open the order through the orders page `?order=` deep link. A failed
// load renders nothing: it is context, not something the seller acts on.
export function RelatedOrders({
  storeId,
  orderId,
}: {
  storeId: string;
  orderId: string;
}) {
  const t = useTranslations("dashboard.assistedOrder.detail.related");
  const locale = useLocale();
  const { slug } = useParams<{ slug?: string }>();
  const { data, isPending, isError } = useRelatedOrders(storeId, orderId);

  if (isError) return null;

  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(new Date(iso));

  return (
    <div className="space-y-2 border-t border-[#f3ebff] pt-4">
      <h3 className="font-semibold text-[#2d1649]">{t("title")}</h3>
      {isPending ? (
        <p role="status" className="text-xs text-[#8f7da8]">
          {t("loading")}
        </p>
      ) : data.items.length === 0 ? (
        <p className="text-sm text-[#8f7da8]">{t("empty")}</p>
      ) : (
        <>
          <p className="text-xs text-[#8f7da8]">
            {t("count", { total: data.total })}
          </p>
          <ul className="space-y-1">
            {data.items.map((item) => {
              const cancelled =
                item.status === "CANCELLED" ||
                item.paymentStatus === "CANCELLED";
              const label = cancelled
                ? t("cancelled")
                : t(`payment.${item.paymentStatus}`);
              const content = (
                <>
                  <span className="font-semibold">#{item.orderNumber}</span>
                  <span className="text-[#8f7da8]">
                    {formatDate(item.createdAt)}
                  </span>
                  <span className={cancelled ? "text-[#b24368]" : undefined}>
                    {label}
                  </span>
                  <span className="ml-auto">
                    {item.currency} {item.totalAmount}
                  </span>
                </>
              );
              const className =
                "flex min-h-11 flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-[#2d1649]";
              return (
                <li key={item.id}>
                  {slug ? (
                    <Link
                      href={`/${locale}/dashboard/${slug}/orders?order=${encodeURIComponent(
                        item.id,
                      )}`}
                      className={`${className} underline-offset-2 hover:underline`}
                    >
                      {content}
                    </Link>
                  ) : (
                    <div className={className}>{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
          {data.total > data.items.length ? (
            <p className="text-xs text-[#8f7da8]">
              {t("more", { shown: data.items.length, total: data.total })}
            </p>
          ) : null}
        </>
      )}
    </div>
  );
}
