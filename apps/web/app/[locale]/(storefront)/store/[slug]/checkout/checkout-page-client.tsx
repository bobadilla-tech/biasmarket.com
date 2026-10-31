"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Camera, MessageCircle, Music2, PackageCheck, X } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { type CartItem, clearCart, getCart, updateQuantity } from "@/lib/cart";
import {
  CheckoutForm,
  CheckoutSummary,
  useDeliveryOptions,
} from "@/features/checkout";

type PaymentMethod = "YAPE" | "PLIN" | "TRANSFER" | "CASH";

interface OrderCreatedResult {
  orderId: string;
  customerEmail: string;
  paymentMethod: PaymentMethod | null;
  requiredAmount: string;
  totalAmount: string;
  currency: string;
  whatsappUrl: string | null;
  deliveryMethodType: string;
  pickupPointLabel: string | null;
  pickupDate: string | null;
  courierName: string | null;
  courierModality: "AGENCY" | "HOME" | null;
  paymentType: "FULL" | "PARTIAL";
  depositPercent: number;
}

export function CheckoutPageClient() {
  const t = useTranslations("storefront.checkoutPage");
  const locale = useLocale();
  const { slug } = useParams<{ slug: string }>();
  const [items, setItems] = useState<CartItem[]>([]);
  const [order, setOrder] = useState<OrderCreatedResult | null>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const confirmationHeadingRef = useRef<HTMLHeadingElement>(null);
  const [paymentType, setPaymentType] = useState<"FULL" | "PARTIAL">("FULL");
  const [depositPercent, setDepositPercent] = useState(100);
  // Reported up by CheckoutForm from the selected delivery method — the
  // summary adds it to the item total before applying the deposit percentage,
  // mirroring what the API charges.
  const [deliveryCost, setDeliveryCost] = useState(0);
  const [canSubmit, setCanSubmit] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Same query key CheckoutForm's own useDeliveryOptions call already
  // populated — reads the cached result (methods + their structured
  // `details`, plus the store's paymentInstructions) instead of firing a
  // second network request for data the form already has.
  const deliveryOptions = useDeliveryOptions(slug);
  useEffect(() => {
    setItems(getCart(slug));
  }, [slug]);

  useEffect(() => {
    if (order && confirmationOpen) confirmationHeadingRef.current?.focus();
  }, [confirmationOpen, order]);

  const handleOrderCreated = (result: OrderCreatedResult) => {
    // The order exists server-side now — drop the cart so the buyer doesn't
    // see already-purchased items on their next visit.
    clearCart(slug);
    setOrder(result);
    setConfirmationOpen(true);
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

  const handleFormStatusChange = useCallback(
    (ready: boolean, submitting: boolean) => {
      setCanSubmit(ready);
      setIsSubmitting(submitting);
    },
    [],
  );

  const handleQuantityChange = useCallback(
    (item: CartItem, quantity: number) => {
      setItems(
        updateQuantity(
          slug,
          { productId: item.productId, variantId: item.variantId },
          quantity,
        ),
      );
    },
    [slug],
  );

  if (order) {
    const methodConfig = deliveryOptions.data?.paymentMethods.find(
      (method) => method.method === order.paymentMethod,
    );
    const details = methodConfig?.details ?? {};
    const store = deliveryOptions.data?.store;
    const partialPayment = order.requiredAmount !== order.totalAmount;
    const deliveryDescription =
      order.deliveryMethodType === "PICKUP"
        ? [
            t("deliveryPickup"),
            order.pickupPointLabel,
            order.pickupDate
              ? new Intl.DateTimeFormat(locale, {
                  day: "numeric",
                  month: "long",
                  timeZone: "UTC",
                }).format(new Date(`${order.pickupDate}T00:00:00Z`))
              : null,
          ]
            .filter(Boolean)
            .join(" · ")
        : [
            order.courierName,
            order.courierModality === "AGENCY"
              ? t("courierModalityAgency")
              : t("courierModalityHome"),
          ]
            .filter(Boolean)
            .join(" · ");
    const socialLinks = [
      { name: "Instagram", href: store?.instagramUrl, Icon: Camera },
      { name: "TikTok", href: store?.tiktokUrl, Icon: Music2 },
      { name: "X", href: store?.twitterUrl, Icon: X },
      {
        name: "WhatsApp",
        href: store?.whatsappNumber
          ? `https://wa.me/${store.whatsappNumber.replace(/\D/g, "")}`
          : null,
        Icon: MessageCircle,
      },
    ].flatMap((item) =>
      typeof item.href === "string" && /^https?:\/\//i.test(item.href)
        ? [{ ...item, href: item.href }]
        : [],
    );

    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="min-h-dvh bg-[#f7f4ff] px-4 py-8 sm:px-6"
      >
        {!confirmationOpen && (
          <div className="mx-auto flex min-h-[70dvh] max-w-xl flex-col items-center justify-center text-center">
            <span className="grid size-16 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
              <PackageCheck aria-hidden="true" className="size-8" />
            </span>
            <h1 className="mt-5 text-2xl font-bold text-gray-950">
              {t("orderCreatedTitle")}
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              {t("orderCreatedBody", { orderId: order.orderId })}
            </p>
            <button
              type="button"
              onClick={() => setConfirmationOpen(true)}
              className="mt-6 min-h-11 rounded-xl bg-white px-5 text-sm font-semibold text-violet-800 shadow-sm ring-1 ring-gray-200"
            >
              {t("viewOrderDetails")}
            </button>
            <Link
              href={`/store/${slug}`}
              className="store-theme-link mt-3 text-sm font-semibold"
            >
              {t("backToStore")}
            </Link>
          </div>
        )}

        {confirmationOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-gray-950/55 p-3 backdrop-blur-sm sm:p-6">
            <button
              type="button"
              aria-label={t("close")}
              className="absolute inset-0 h-full w-full cursor-default"
              onClick={() => setConfirmationOpen(false)}
            />
            <section
              role="dialog"
              aria-modal="true"
              aria-labelledby="checkout-order-created-title"
              className="relative z-10 my-auto w-full max-w-4xl overflow-hidden rounded-[1.75rem] bg-white shadow-2xl"
              onKeyDown={(event) => {
                if (event.key === "Escape") setConfirmationOpen(false);
              }}
            >
              <button
                type="button"
                aria-label={t("closeConfirmation")}
                onClick={() => setConfirmationOpen(false)}
                className="absolute right-3 top-3 z-10 grid size-11 place-items-center rounded-full bg-white/90 text-gray-600 shadow-sm ring-1 ring-gray-200 transition hover:bg-gray-50"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
              <div className="grid lg:grid-cols-[minmax(0,1fr)_19rem]">
                <div className="p-5 pt-14 sm:p-8 sm:pt-10">
                  <div className="flex items-start gap-4">
                    <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
                      <PackageCheck aria-hidden="true" className="size-6" />
                    </span>
                    <div>
                      <h1
                        ref={confirmationHeadingRef}
                        id="checkout-order-created-title"
                        tabIndex={-1}
                        className="text-xl font-bold text-gray-950 outline-none sm:text-2xl"
                      >
                        {t("orderCreatedTitle")}
                      </h1>
                      <p className="mt-1 text-sm text-gray-500">
                        {t("orderCreatedSubtitle")}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-violet-50 px-4 py-2 text-sm font-bold text-violet-800">
                      {t("orderCodeAndAmount", {
                        orderId: order.orderId,
                        amount: `${order.requiredAmount} ${order.currency}`,
                      })}
                    </span>
                    {partialPayment && (
                      <span className="rounded-full bg-orange-100 px-4 py-2 text-sm font-semibold text-orange-800">
                        {t("depositBadge", {
                          amount: `${order.requiredAmount} ${order.currency}`,
                        })}
                      </span>
                    )}
                  </div>

                  <div className="mt-5 rounded-2xl border border-gray-100 bg-gray-50/80 p-4 sm:p-5">
                    <dl className="space-y-4 text-sm">
                      <div>
                        <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                          {t("confirmationDeliveryLabel")}
                        </dt>
                        <dd className="mt-1 font-semibold text-gray-900">
                          {deliveryDescription}
                        </dd>
                      </div>
                      <div className="border-t border-gray-200 pt-3">
                        <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                          {t("confirmationMethodLabel")}
                        </dt>
                        <dd className="mt-1 font-semibold text-gray-900">
                          {order.paymentMethod
                            ? t(`paymentMethodLabels.${order.paymentMethod}`)
                            : t("paymentDetailsNotConfigured")}
                          {partialPayment &&
                            ` · ${t("depositPercentLabel", { percent: order.depositPercent })}`}
                        </dd>
                      </div>
                      {order.customerEmail && (
                        <div className="border-t border-gray-200 pt-3">
                          <dt className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                            {t("confirmationEmailLabel")}
                          </dt>
                          <dd className="mt-1 font-medium text-gray-900">
                            {order.customerEmail}
                          </dd>
                        </div>
                      )}
                      {order.requiredAmount !== order.totalAmount && (
                        <>
                          <div className="flex justify-between border-t border-gray-200 pt-3 text-gray-600">
                            <dt>{t("paymentSummaryTotal")}</dt>
                            <dd>
                              {order.totalAmount} {order.currency}
                            </dd>
                          </div>
                          <div className="flex justify-between font-semibold text-gray-900">
                            <dt>{t("paymentSummaryPending")}</dt>
                            <dd>
                              {(
                                parseFloat(order.totalAmount) -
                                parseFloat(order.requiredAmount)
                              ).toFixed(2)}{" "}
                              {order.currency}
                            </dd>
                          </div>
                        </>
                      )}
                    </dl>
                  </div>

                  {order.customerEmail && (
                    <p className="mt-4 text-sm text-gray-600">
                      {t("checkEmailNotice")}
                    </p>
                  )}
                  <p className="mt-4 text-sm leading-6 text-gray-600">
                    {t("shareProofNotice")}
                  </p>

                  <div className="mt-5 rounded-2xl border border-gray-100 p-4">
                    <p className="font-semibold text-gray-900">{store?.name}</p>
                    {store?.whatsappNumber && (
                      <p className="mt-1 text-sm text-gray-600">
                        {store.whatsappNumber}
                      </p>
                    )}
                    {socialLinks.length > 0 && (
                      <div className="mt-3 flex gap-2">
                        {socialLinks.map(({ name, href, Icon }) => (
                          <a
                            key={name}
                            href={href}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={`${name} · ${store?.name}`}
                            className="grid size-10 place-items-center rounded-full bg-gray-50 text-gray-700 ring-1 ring-gray-200 transition hover:bg-violet-50 hover:text-violet-800"
                          >
                            <Icon aria-hidden="true" className="size-4" />
                          </a>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                    {order.whatsappUrl && (
                      <a
                        href={order.whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="store-theme-primary-button flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl px-5 text-sm font-semibold"
                      >
                        <MessageCircle aria-hidden="true" className="size-4" />
                        {t("whatsappButton")}
                      </a>
                    )}
                    <Link
                      href={`/store/${slug}/account/orders/${order.orderId}`}
                      className="flex min-h-12 flex-1 items-center justify-center rounded-xl border border-gray-200 px-5 text-sm font-semibold text-gray-800 transition hover:bg-gray-50"
                    >
                      {t("viewOrderLink")}
                    </Link>
                  </div>
                </div>

                <aside className="hidden flex-col items-center justify-center bg-gradient-to-br from-violet-50 via-purple-50 to-orange-50 p-8 text-center lg:flex">
                  <div className="relative grid size-48 place-items-center rounded-[2rem] bg-white shadow-lg ring-1 ring-violet-100">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 176 176"
                      className="size-40"
                      fill="none"
                    >
                      <path
                        d="m29 70 59-34 59 34v65l-59 34-59-34V70Z"
                        fill="#F3E8FF"
                        stroke="#7C3AED"
                        strokeWidth="4"
                        strokeLinejoin="round"
                      />
                      <path
                        d="m29 70 59 35 59-35M88 105v64M59 53l59 35"
                        stroke="#7C3AED"
                        strokeWidth="4"
                        strokeLinejoin="round"
                      />
                      <rect
                        x="88"
                        y="19"
                        width="48"
                        height="62"
                        rx="8"
                        fill="white"
                        stroke="#C4B5FD"
                        strokeWidth="4"
                      />
                      <path
                        d="M99 36h25M99 48h25M99 60h14"
                        stroke="#A78BFA"
                        strokeWidth="4"
                        strokeLinecap="round"
                      />
                      <circle cx="130" cy="126" r="24" fill="#DCFCE7" />
                      <path
                        d="m119 126 7 7 15-16"
                        stroke="#15803D"
                        strokeWidth="5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                  <p className="mt-8 max-w-xs text-sm leading-6 text-gray-600">
                    {t("orderCreatedBody", { orderId: order.orderId })}
                  </p>
                </aside>
              </div>
            </section>
          </div>
        )}
      </main>
    );
  }

  if (items.length === 0) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="min-h-dvh flex items-center justify-center bg-gray-50 px-6"
      >
        <p className="text-gray-500">
          {t("emptyCart")}{" "}
          <Link
            href={`/store/${slug}`}
            className="store-theme-link font-semibold"
          >
            {t("backToStore")}
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="min-h-dvh bg-[#f7f4ff] px-4 py-6 sm:px-6 sm:py-10"
    >
      <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-8">
        <div className="flex min-w-0 flex-col gap-6">
          <div>
            <Link
              href={`/store/${slug}`}
              className="inline-flex min-h-11 items-center text-sm font-medium text-gray-600 hover:underline"
            >
              ‹ {t("backToStore")}
            </Link>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-gray-950 sm:text-3xl">
              {t("title")}
            </h1>
          </div>
          <CheckoutForm
            slug={slug}
            items={items}
            onPaymentTypeChange={handlePaymentTypeChange}
            onDeliveryCostChange={handleDeliveryCostChange}
            onFormStatusChange={handleFormStatusChange}
            onOrderCreated={handleOrderCreated}
          />
        </div>
        <aside className="order-1 lg:sticky lg:top-6 lg:order-2">
          <CheckoutSummary
            items={items}
            paymentType={paymentType}
            depositPercent={depositPercent}
            deliveryCost={deliveryCost}
            canSubmit={canSubmit}
            isSubmitting={isSubmitting}
            onQuantityChange={handleQuantityChange}
          />
        </aside>
      </div>
    </main>
  );
}
