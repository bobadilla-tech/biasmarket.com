"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ClipboardCopy, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  formatOrderDate,
  getDeliveryLabel,
  getOrderNumber,
  getShippingAddress,
  formatShippingDetailsForCopy,
} from "../lib/order-format";
import { paymentsLocked } from "../lib/order-status";
import { isPendingProof, recordableCents } from "../lib/payment-limits";
import { SellerPaymentForm } from "./seller-payment-form";
import { PaymentHistoryList } from "./payment-history-list";
import { OrderShippingSection } from "./order-shipping-section";
// Deep path rather than the feature barrel, so the sheet does not load the
// new-order form and its navigation dependencies.
import { AssistedOrderSection } from "@/features/assisted-orders/components/assisted-order-section";
import type { OrderResponseDto } from "@biasmarket/types";
import type { SellerPaymentInput } from "@biasmarket/validation";

export function OrderDetailSheet({
  open,
  onOpenChange,
  order,
  isPending,
  fulfillmentLabels: _fulfillmentLabels,
  enabledMethods,
  registerPaymentSubmitting,
  onRegisterPayment,
  onPreviewPayment,
  onApprove,
  onReject,
  onAdvance: _onAdvance,
  onCancel,
  storeId,
  storeName = "",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderResponseDto | null;
  isPending: boolean;
  fulfillmentLabels: Record<string, string>;
  enabledMethods: string[];
  registerPaymentSubmitting: boolean;
  onRegisterPayment: (
    values: SellerPaymentInput,
    options?: { confirmDuplicate?: boolean },
  ) => Promise<unknown>;
  onPreviewPayment: (url: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onAdvance: () => void;
  onCancel: () => void;
  // Needed only for seller-assisted orders (their link actions).
  storeId?: string;
  storeName?: string;
}) {
  const t = useTranslations("dashboard.orders");
  const { locale } = useParams<{ locale: string }>();

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        size="lg"
        aria-label={
          order
            ? t("details.title", { number: getOrderNumber(order.id) })
            : t("details.title", { number: "" })
        }
        className="h-dvh gap-0 overflow-y-auto"
      >
        {order ? (
          <>
            <SheetHeader>
              <SheetTitle>
                {t("details.title", { number: getOrderNumber(order.id) })}
              </SheetTitle>
              <SheetDescription>
                {order.customerName ?? order.customerPhone}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 px-4 pb-24 pt-4">
              <div className="space-y-4 rounded-[24px] border border-[#eadcf8] bg-gradient-to-b from-[#fcf9ff] to-white p-5 shadow-sm">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-[#8f7da8]">
                    {t("details.total")}
                  </span>
                  <span className="font-bold text-[#2d1649]">
                    {order.currency} {order.totalAmount}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-[#8f7da8]">
                    {t("details.paid")}
                  </span>
                  <span className="font-bold text-[#159a63]">
                    {order.currency} {order.paidAmount.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-[#8f7da8]">
                    {t("details.pending")}
                  </span>
                  <span className="font-bold text-[#d11d52]">
                    {order.currency} {order.pendingAmount.toFixed(2)}
                  </span>
                </div>

                <div className="space-y-2.5 border-t border-[#f3ebff] pt-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-[#2d1649]">
                      {t("details.progress")}
                    </span>
                    <span className="font-bold text-[var(--store-primary)]">
                      {Math.round(
                        order.fulfillmentStatus === "COMPLETED"
                          ? 100
                          : order.paidPercentage,
                      )}
                      %
                    </span>
                  </div>
                  <div className="h-2.5 overflow-hidden rounded-full bg-[#f0e7f8] shadow-inner">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[var(--store-accent)] to-[var(--store-primary)] transition-all duration-500"
                      style={{
                        width: `${
                          order.fulfillmentStatus === "COMPLETED"
                            ? 100
                            : order.paidPercentage
                        }%`,
                      }}
                    />
                  </div>
                </div>

                <div className="space-y-2 border-t border-[#f3ebff] pt-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-[#8f7da8]">
                      {t("details.delivery")}
                    </span>
                    <span className="font-semibold text-[#2d1649]">
                      {getDeliveryLabel(order, t)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium text-[#8f7da8]">
                      {t("details.date")}
                    </span>
                    <span className="font-semibold text-[#2d1649]">
                      {formatOrderDate(order.createdAt, locale, t)}
                    </span>
                  </div>
                </div>

                {(() => {
                  const shippingAddress = getShippingAddress(order);
                  if (!shippingAddress) return null;
                  const buyerName = [
                    shippingAddress.recipientName,
                    shippingAddress.recipientSurnames,
                  ]
                    .filter(Boolean)
                    .join(" ");
                  const location = [
                    shippingAddress.department,
                    shippingAddress.province,
                    shippingAddress.district,
                  ]
                    .filter(Boolean)
                    .join(" / ");
                  const documentType =
                    shippingAddress.documentType === "DNI"
                      ? t("details.shippingDocumentTypes.DNI")
                      : shippingAddress.documentType === "PASSPORT"
                        ? t("details.shippingDocumentTypes.PASSPORT")
                        : shippingAddress.documentType;
                  const document = [
                    documentType,
                    shippingAddress.documentNumber,
                  ]
                    .filter(Boolean)
                    .join(" ");
                  const modality =
                    order.courierModality === "AGENCY"
                      ? t("details.courierModalities.AGENCY")
                      : order.courierModality === "HOME"
                        ? t("details.courierModalities.HOME")
                        : undefined;
                  const copyShippingDetails = async () => {
                    const text = formatShippingDetailsForCopy(
                      order,
                      shippingAddress,
                      {
                        courier: t("details.shippingLabels.courier"),
                        modality: t("details.shippingLabels.modality"),
                        agencyModality: t("details.courierModalities.AGENCY"),
                        homeModality: t("details.courierModalities.HOME"),
                        recipient: t("details.shippingLabels.recipient"),
                        document: t("details.shippingLabels.document"),
                        phone: t("details.shippingLabels.phone"),
                        location: t("details.shippingLabels.location"),
                        agency: t("details.shippingLabels.agency"),
                        address: t("details.shippingLabels.address"),
                        reference: t("details.shippingLabels.reference"),
                        order: t("details.shippingLabels.order"),
                      },
                    );
                    try {
                      await navigator.clipboard.writeText(text);
                      toast.success(t("details.shippingCopied"));
                    } catch {
                      toast.error(t("details.shippingCopyError"));
                    }
                  };
                  return (
                    <div className="space-y-2 border-t border-[#f3ebff] pt-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-medium text-[#8f7da8]">
                          {t("details.shippingAddress")}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void copyShippingDetails()}
                          className="h-8 rounded-lg border-[#eadcf8] text-xs"
                        >
                          <ClipboardCopy
                            aria-hidden="true"
                            className="size-3.5"
                          />
                          {t("details.shippingCopyButton")}
                        </Button>
                      </div>
                      {(order.courierName || modality) && (
                        <p className="font-semibold text-[#2d1649]">
                          {[order.courierName, modality]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      )}
                      <p className="font-semibold text-[#2d1649]">
                        {buyerName}
                      </p>
                      <p className="text-[#2d1649]">
                        {t("details.shippingLabels.phone")}:{" "}
                        {shippingAddress.phone}
                      </p>
                      {document && (
                        <p className="text-[#2d1649]">
                          {t("details.shippingLabels.document")}: {document}
                        </p>
                      )}
                      {location && (
                        <p className="text-[#2d1649]">
                          {t("details.shippingLabels.location")}: {location}
                        </p>
                      )}
                      {order.courierModality === "AGENCY" &&
                        shippingAddress.agencyName && (
                          <p className="text-[#2d1649]">
                            {t("details.shippingLabels.agency")}:{" "}
                            {shippingAddress.agencyName}
                          </p>
                        )}
                      {order.courierModality === "HOME" && (
                        <>
                          {shippingAddress.line1 && (
                            <p className="text-[#2d1649]">
                              {t("details.shippingLabels.address")}:{" "}
                              {shippingAddress.line1}
                              {shippingAddress.line2
                                ? `, ${shippingAddress.line2}`
                                : ""}
                            </p>
                          )}
                          {shippingAddress.reference && (
                            <p className="text-[#8f7da8]">
                              {t("details.shippingLabels.reference")}:{" "}
                              {shippingAddress.reference}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>

              {order.source === "VENDOR_ASSISTED" && storeId ? (
                <AssistedOrderSection
                  key={order.id}
                  order={order}
                  storeId={storeId}
                  storeName={storeName}
                />
              ) : null}

              <OrderShippingSection order={order} storeId={storeId} />

              <div className="space-y-4 rounded-[24px] border border-[#eadcf8] bg-white p-5 shadow-sm">
                <div className="flex items-center gap-2 text-[#2d1649]">
                  <Wallet className="size-5 text-[var(--store-primary)]" />
                  <h3 className="font-semibold">{t("details.addPayment")}</h3>
                </div>

                {paymentsLocked(order) ? (
                  <Card className="rounded-2xl border-[#eadcf8] bg-[#fcf9ff] py-0 shadow-none">
                    <CardContent className="px-4 py-3 text-sm text-[#8f7da8]">
                      {t("details.paymentsLocked")}
                    </CardContent>
                  </Card>
                ) : (
                  <SellerPaymentForm
                    key={order.id}
                    maxCents={recordableCents(
                      order.pendingAmount,
                      order.payments,
                    )}
                    hasPendingProof={order.payments.some(isPendingProof)}
                    enabledMethods={enabledMethods}
                    submitting={registerPaymentSubmitting}
                    onSubmit={onRegisterPayment}
                  />
                )}

                <PaymentHistoryList
                  currency={order.currency}
                  payments={order.payments}
                  order={order}
                  onPreview={onPreviewPayment}
                />
              </div>

              <div className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#927fac]">
                  {t("details.items")}
                </p>
                <div className="space-y-2">
                  {order.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between rounded-2xl border border-[#f0e7f8] bg-white px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-[#2d1649]">
                          {item.product.name}
                          {item.variant?.name ? ` (${item.variant.name})` : ""}
                        </p>
                        <p className="text-xs text-[#8f7da8]">
                          {t("details.quantity", { count: item.quantity })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <SheetFooter className="sticky bottom-0 border-t border-[#f0e7f8] bg-white px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
              <div className="flex w-full flex-wrap gap-2">
                {!isPending &&
                  (order.paymentStatus === "PENDING_PAYMENT" ||
                    order.paymentStatus === "PAYMENT_SUBMITTED" ||
                    order.paymentStatus === "PARTIALLY_PAID") && (
                    <>
                      <Button
                        type="button"
                        onClick={onApprove}
                        disabled={order.paidAmount <= 0}
                        title={
                          order.paidAmount <= 0
                            ? order.paymentStatus === "PAYMENT_SUBMITTED"
                              ? t("approveReviewProof")
                              : t("approveDisabledNoPayment")
                            : undefined
                        }
                        className="store-theme-primary-button min-h-11 h-auto flex-1 rounded-2xl py-2.5 text-sm font-semibold whitespace-normal hover:opacity-100 disabled:pointer-events-auto disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {t("approve")}
                      </Button>
                      {order.paidAmount <= 0 && (
                        <span className="sr-only">
                          {order.paymentStatus === "PAYMENT_SUBMITTED"
                            ? t("approveReviewProof")
                            : t("approveDisabledNoPayment")}
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        onClick={onReject}
                        className="min-h-11 h-auto flex-1 rounded-2xl border-[#eadcf7] bg-white py-2.5 text-sm font-semibold whitespace-normal text-[#2d1649] shadow-none hover:bg-[#fcf9ff]"
                      >
                        {t("reject")}
                      </Button>
                    </>
                  )}
                {!isPending &&
                  order.status !== "CANCELLED" &&
                  order.paymentStatus !== "REJECTED" &&
                  order.fulfillmentStatus !== "COMPLETED" && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onCancel}
                      className="min-h-11 h-auto flex-1 rounded-2xl border-red-200 py-2.5 whitespace-normal text-red-600 hover:bg-red-50"
                    >
                      {t("cancelOrder")}
                    </Button>
                  )}
              </div>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
