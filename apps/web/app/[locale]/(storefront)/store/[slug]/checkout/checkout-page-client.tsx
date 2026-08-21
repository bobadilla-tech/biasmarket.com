"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { MessageCircle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { type CartItem, clearCart, getCart } from "@/lib/cart";
import {
  CheckoutForm,
  CheckoutSummary,
  useDeliveryOptions,
} from "@/features/checkout";
import { useCustomerProfile } from "@/features/customer-auth";

type PaymentMethod = "YAPE" | "PLIN" | "TRANSFER" | "CASH";

interface OrderCreatedResult {
  orderId: string;
  customerEmail: string;
  paymentMethod: PaymentMethod | null;
  requiredAmount: string;
  totalAmount: string;
  currency: string;
  whatsappUrl: string | null;
}

export function CheckoutPageClient() {
  const t = useTranslations("storefront.checkoutPage");
  const { slug } = useParams<{ slug: string }>();
  const [items, setItems] = useState<CartItem[]>([]);
  const [order, setOrder] = useState<OrderCreatedResult | null>(null);
  const [paymentType, setPaymentType] = useState<"FULL" | "PARTIAL">("FULL");
  const [depositPercent, setDepositPercent] = useState(100);
  // Reported up by CheckoutForm from the selected delivery method — the
  // summary adds it to the item total before applying the deposit percentage,
  // mirroring what the API charges.
  const [deliveryCost, setDeliveryCost] = useState(0);
  // Same query key CheckoutForm's own useDeliveryOptions call already
  // populated — reads the cached result (methods + their structured
  // `details`, plus the store's paymentInstructions) instead of firing a
  // second network request for data the form already has.
  const deliveryOptions = useDeliveryOptions(slug);
  // Guest checkout has no `Customer`/`BuyerAccount` row to view — only show
  // the link when the buyer session cookie actually resolves.
  const customerProfile = useCustomerProfile(slug);

  useEffect(() => {
    setItems(getCart(slug));
  }, [slug]);

  const handleOrderCreated = (result: OrderCreatedResult) => {
    // The order exists server-side now — drop the cart so the buyer doesn't
    // see already-purchased items on their next visit.
    clearCart(slug);
    setOrder(result);
  };

  const handlePaymentTypeChange = (
    newPaymentType: "FULL" | "PARTIAL",
    newDepositPercent: number,
  ) => {
    setPaymentType(newPaymentType);
    setDepositPercent(newDepositPercent);
  };

  const handleDeliveryCostChange = (newDeliveryCost: number) => {
    setDeliveryCost(newDeliveryCost);
  };

  if (order) {
    const methodConfig = deliveryOptions.data?.paymentMethods.find(
      (m) => m.method === order.paymentMethod,
    );
    const details = methodConfig?.details ?? {};
    const hasTransferDetails =
      typeof details.bankName === "string" && details.bankName;
    const hasWalletDetails =
      typeof details.phoneNumber === "string" && details.phoneNumber;

    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6 py-10">
        <div className="w-full max-w-md text-center">
          <h1 className="text-xl font-bold text-gray-900">
            {t("orderCreatedTitle")}
          </h1>
          <p className="mt-2 text-gray-500">
            {t("orderCreatedBody", { orderId: order.orderId })}
          </p>
          {order.customerEmail && (
            <p className="mt-2 text-gray-500">{t("checkEmailNotice")}</p>
          )}

          <div className="mt-6 flex flex-col gap-4 rounded-2xl border border-gray-100 bg-white p-6 text-left shadow-sm">
            {order.requiredAmount !== order.totalAmount && (
              <div className="flex justify-between text-sm text-gray-600">
                <span>{t("paymentSummaryTotal")}</span>
                <span>
                  {order.totalAmount} {order.currency}
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="font-semibold text-gray-900">
                {order.requiredAmount !== order.totalAmount
                  ? t("paymentSummaryPayNow")
                  : t("confirmationAmountLabel")}
              </span>
              <span className="text-gray-700">
                {order.requiredAmount} {order.currency}
              </span>
            </div>
            {order.requiredAmount !== order.totalAmount && (
              <div className="flex justify-between text-sm text-gray-500">
                <span>{t("paymentSummaryPending")}</span>
                <span>
                  {(
                    parseFloat(order.totalAmount) -
                    parseFloat(order.requiredAmount)
                  ).toFixed(2)}{" "}
                  {order.currency}
                </span>
              </div>
            )}

            {order.paymentMethod && (
              <div className="flex flex-col gap-2 border-t border-gray-100 pt-4">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {t("confirmationMethodLabel")}
                </span>
                <span className="text-sm font-medium text-gray-900">
                  {t(`paymentMethodLabels.${order.paymentMethod}`)}
                </span>

                {order.paymentMethod === "CASH" && (
                  <p className="text-sm text-gray-600">
                    {t("confirmationCashNote")}
                  </p>
                )}

                {order.paymentMethod === "TRANSFER" &&
                  (hasTransferDetails ? (
                    <dl className="flex flex-col gap-1 text-sm text-gray-600">
                      <div className="flex justify-between">
                        <dt>{t("confirmationBankName")}</dt>
                        <dd className="font-medium text-gray-900">
                          {String(details.bankName)}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>{t("confirmationAccountNumber")}</dt>
                        <dd className="font-medium text-gray-900">
                          {String(details.accountNumber)}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>{t("confirmationAccountHolder")}</dt>
                        <dd className="font-medium text-gray-900">
                          {String(details.accountHolder)}
                        </dd>
                      </div>
                      {typeof details.accountType === "string" &&
                        details.accountType && (
                          <div className="flex justify-between">
                            <dt>{t("confirmationAccountType")}</dt>
                            <dd className="font-medium text-gray-900">
                              {String(details.accountType)}
                            </dd>
                          </div>
                        )}
                    </dl>
                  ) : (
                    <p className="text-sm text-amber-600">
                      {t("confirmationNoDetails")}
                    </p>
                  ))}

                {(order.paymentMethod === "YAPE" ||
                  order.paymentMethod === "PLIN") &&
                  (hasWalletDetails ? (
                    <div className="flex flex-col items-start gap-2">
                      <dl className="flex flex-col gap-1 text-sm text-gray-600">
                        <div className="flex justify-between gap-4">
                          <dt>{t("confirmationPhoneNumber")}</dt>
                          <dd className="font-medium text-gray-900">
                            {String(details.phoneNumber)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-4">
                          <dt>{t("confirmationAccountHolder")}</dt>
                          <dd className="font-medium text-gray-900">
                            {String(details.accountHolder)}
                          </dd>
                        </div>
                      </dl>
                      {typeof details.qrImageUrl === "string" &&
                        details.qrImageUrl && (
                          <Image
                            src={details.qrImageUrl}
                            alt={t("confirmationQrAlt")}
                            width={160}
                            height={160}
                            className="mx-auto size-40 rounded-lg border border-gray-100 object-contain"
                          />
                        )}
                    </div>
                  ) : (
                    <p className="text-sm text-amber-600">
                      {t("confirmationNoDetails")}
                    </p>
                  ))}
              </div>
            )}

            {deliveryOptions.data?.storePaymentInstructions && (
              <div className="flex flex-col gap-1 border-t border-gray-100 pt-4">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {t("confirmationStoreInstructionsLabel")}
                </span>
                <p className="whitespace-pre-line text-sm text-gray-600">
                  {deliveryOptions.data.storePaymentInstructions}
                </p>
              </div>
            )}
          </div>

          {order.whatsappUrl && (
            <a
              href={order.whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="store-theme-primary-button mt-6 flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-semibold"
            >
              <MessageCircle className="size-4" />
              {t("whatsappButton")}
            </a>
          )}

          {customerProfile.data && (
            <Link
              href={`/store/${slug}/account/orders/${order.orderId}`}
              className="store-theme-link mt-4 block text-sm font-semibold"
            >
              {t("viewOrderLink")}
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 px-6">
        <p className="text-gray-500">
          {t("emptyCart")}{" "}
          <Link
            href={`/store/${slug}`}
            className="store-theme-link font-semibold"
          >
            {t("backToStore")}
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="max-w-md mx-auto flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>
        <CheckoutSummary
          items={items}
          paymentType={paymentType}
          depositPercent={depositPercent}
          deliveryCost={deliveryCost}
        />
        <CheckoutForm
          slug={slug}
          items={items}
          onPaymentTypeChange={handlePaymentTypeChange}
          onDeliveryCostChange={handleDeliveryCostChange}
          onOrderCreated={handleOrderCreated}
        />
      </div>
    </div>
  );
}
