"use client";

import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  Banknote,
  Check,
  Home,
  Landmark,
  MessageCircle,
  Percent,
  Store,
  Truck,
  Wallet,
} from "lucide-react";
import { isPaymentMethodConfigured } from "@biasmarket/utils/payment-methods";
import type { CheckoutPaymentMethod } from "@biasmarket/utils/payment-methods";
import { PhoneInput } from "@/components/ui/phone-input";
import { type CartItem, hasMixedCurrencies } from "@/lib/cart";
import { useDeliveryOptions } from "../queries/use-delivery-options";
import { useDefaultShippingAddress } from "../queries/use-default-shipping-address";
import { useCustomerProfile } from "@/features/customer-auth";
import { useSubmitCheckout } from "../mutations/use-submit-checkout";
import {
  getPickupAvailability,
  nextDateForWeekday,
} from "../lib/pickup-availability";
import { SelectableCard } from "./selectable-card";
import { PaymentMethodDetails } from "./payment-method-details";
import { PaymentProofUpload } from "./payment-proof-upload";
import {
  buildCheckoutFormSchema,
  type CheckoutFormInput,
} from "../schemas/checkout.schema";

const inputClassName =
  "store-theme-input rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none";

const PAYMENT_METHOD_ICONS: Record<string, React.ReactNode> = {
  YAPE: (
    <Image
      src="/logos/integrations/yape.webp"
      alt="Yape"
      width={200}
      height={200}
      className="size-5 object-contain"
    />
  ),
  PLIN: (
    <Image
      src="/logos/integrations/plin.png"
      alt="Plin"
      width={185}
      height={185}
      className="size-5 object-contain"
    />
  ),
  TRANSFER: <Landmark className="size-5" />,
  CASH: <Banknote className="size-5" />,
};

interface CheckoutFormProps {
  slug: string;
  items: CartItem[];
  onPaymentTypeChange?: (
    paymentType: "FULL" | "PARTIAL",
    depositPercent: number,
  ) => void;
  // Server-equivalent delivery cost of the selected method — the summary's
  // pay-now/pending math must add it before applying the deposit percentage,
  // exactly like CreateOrderUseCase does with
  // deliveryConfig.details.estimatedCost.
  onDeliveryCostChange?: (deliveryCost: number) => void;
  onOrderCreated: (result: {
    orderId: string;
    customerEmail: string;
    paymentMethod: "YAPE" | "PLIN" | "TRANSFER" | "CASH" | null;
    requiredAmount: string;
    totalAmount: string;
    currency: string;
    whatsappUrl: string | null;
  }) => void;
}

// next-intl's typed t() rejects a template-literal key — these two build a
// lookup from static literal calls instead of `t(\`...${key}\`)`, same
// pattern as store-settings/delivery-section.tsx's weekdayLabels().
function weekdayLabels(
  t: ReturnType<typeof useTranslations>,
): Record<number, string> {
  return {
    0: t("weekdays.0"),
    1: t("weekdays.1"),
    2: t("weekdays.2"),
    3: t("weekdays.3"),
    4: t("weekdays.4"),
    5: t("weekdays.5"),
    6: t("weekdays.6"),
  };
}

function toDateInputValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function paymentMethodLabels(
  t: ReturnType<typeof useTranslations>,
): Record<string, string> {
  return {
    YAPE: t("paymentMethodLabels.YAPE"),
    PLIN: t("paymentMethodLabels.PLIN"),
    TRANSFER: t("paymentMethodLabels.TRANSFER"),
    CASH: t("paymentMethodLabels.CASH"),
  };
}

export function CheckoutForm({
  slug,
  items,
  onPaymentTypeChange,
  onDeliveryCostChange,
  onOrderCreated,
}: CheckoutFormProps) {
  const t = useTranslations("storefront.checkoutPage");
  const deliveryOptions = useDeliveryOptions(slug);
  const defaultAddress = useDefaultShippingAddress(slug);
  const customerProfile = useCustomerProfile(slug);
  const submitCheckout = useSubmitCheckout(slug);

  const methods = deliveryOptions.data?.methods ?? [];
  const points = deliveryOptions.data?.points ?? [];
  const paymentMethods = deliveryOptions.data?.paymentMethods ?? [];
  const couriers = deliveryOptions.data?.couriers ?? [];
  const deliveryMethodsLoaded = !deliveryOptions.isPending;
  const mixedCurrencies = hasMixedCurrencies(items);

  // The server computes the weekday it validates openDays against and ships
  // it in the delivery-options payload — the form must use that value, not
  // `new Date().getDay()`. If buyer and API server are on different calendar
  // days, browser-local and server-local weekdays diverge and a point the
  // storefront shows as available gets rejected by CreateOrderUseCase (or
  // vice versa). One value, served and consumed, keeps them aligned.
  const weekday = deliveryOptions.data?.weekday;
  // A closed-today point is still a selectable, completable choice now (it
  // just needs a future pickupDate) — `points.length > 0` is what decides
  // whether a pickup point is required *at all* and whether the submit
  // button's pickup gate applies, not "available today" anymore.
  // `pointsAvailableToday` is kept separately, only for the auto-select
  // default below (preserving today's good-case UX of not making the buyer
  // pick anything when a same-day point exists).
  const pointsAvailableToday = useMemo(
    () =>
      points.filter(
        (point) =>
          weekday !== undefined &&
          getPickupAvailability(point, weekday).availableToday,
      ),
    [points, weekday],
  );
  const pointsRequiringDate = useMemo(
    () =>
      new Set(
        points
          .filter(
            (point) =>
              weekday !== undefined &&
              !getPickupAvailability(point, weekday).availableToday,
          )
          .map((point) => point.id),
      ),
    [points, weekday],
  );

  // A method the store enabled but never finished configuring (empty
  // details) can't collect a real proof of payment against — checkout falls
  // back to WhatsApp coordination for it instead of blocking on an upload.
  const unconfiguredManualMethods = useMemo(
    () =>
      new Set(
        paymentMethods
          .filter(
            (m) =>
              m.method !== "CASH" &&
              !isPaymentMethodConfigured(m.method, m.details),
          )
          .map((m) => m.method as CheckoutPaymentMethod),
      ),
    [paymentMethods],
  );

  const form = useForm<CheckoutFormInput>({
    resolver: zodResolver(
      buildCheckoutFormSchema(
        points.length > 0,
        paymentMethods.length > 0,
        pointsRequiringDate,
        unconfiguredManualMethods,
      ),
    ),
    defaultValues: {
      customerName: "",
      customerPhone: "",
      customerEmail: "",
      deliveryMethodType: "",
      pickupPointId: "",
      pickupDate: "",
      paymentMethod: "",
      paymentType: "FULL",
      courierName: "",
      courierModality: "",
      shippingRecipientName: "",
      shippingRecipientSurnames: "",
      shippingPhone: "",
      shippingDocumentType: "",
      shippingDocumentNumber: "",
      shippingDepartment: "",
      shippingProvince: "",
      shippingDistrict: "",
      shippingLine1: "",
      shippingLine2: "",
      shippingCity: "",
      shippingRegion: "",
      shippingReference: "",
      shippingAgencyName: "",
      paymentProof: null,
    },
  });

  useEffect(() => {
    if (!deliveryOptions.data) return;
    if (
      deliveryOptions.data.methods[0] &&
      !form.getValues("deliveryMethodType")
    ) {
      form.setValue("deliveryMethodType", deliveryOptions.data.methods[0].type);
    }
    // Keep the selected point valid whenever the points list changes: drop
    // a stale id. Default to the first available-today point when one
    // exists (preserves the no-thinking-required good-case UX); otherwise
    // leave the field unset so the buyer must explicitly choose a point and
    // pick a date — never auto-select a closed-today point with no date
    // attached.
    const currentPointId = form.getValues("pickupPointId");
    if (points.length === 0) {
      if (currentPointId) form.setValue("pickupPointId", "");
    } else if (!points.some((point) => point.id === currentPointId)) {
      form.setValue("pickupPointId", pointsAvailableToday[0]?.id ?? "");
    }
    // Prefer a genuinely-configured method when one exists, so a store
    // listing an unconfigured YAPE before a configured TRANSFER doesn't
    // silently default new buyers into WhatsApp coordination. CASH is
    // excluded from this preference — it's seeded enabled on every store
    // and always counts as "configured" (needs no details), so without the
    // exclusion it would win `.find()` on every store and this would
    // become "prefer CASH" instead of "prefer configured".
    const preferredMethod =
      paymentMethods.find(
        (m) =>
          m.method !== "CASH" && isPaymentMethodConfigured(m.method, m.details),
      ) ?? paymentMethods[0];
    if (preferredMethod && !form.getValues("paymentMethod")) {
      form.setValue("paymentMethod", preferredMethod.method);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    deliveryOptions.data,
    points,
    pointsAvailableToday,
    paymentMethods,
    form.setValue,
    form.getValues,
  ]);

  const customerPhone = form.watch("customerPhone");
  const deliveryMethodType = form.watch("deliveryMethodType");
  const courierName = form.watch("courierName");
  const courierModality = form.watch("courierModality");
  const pickupPointId = form.watch("pickupPointId");
  const pickupDate = form.watch("pickupDate");
  const paymentMethod = form.watch("paymentMethod");
  const paymentType = form.watch("paymentType");
  const paymentProof = form.watch("paymentProof");
  const selectedPaymentConfig = paymentMethods.find(
    (m) => m.method === paymentMethod,
  );
  const selectedMethodConfigured = selectedPaymentConfig
    ? isPaymentMethodConfigured(
        selectedPaymentConfig.method,
        selectedPaymentConfig.details,
      )
    : true;
  const shippingRecipientName = form.watch("shippingRecipientName");
  const shippingPhone = form.watch("shippingPhone");
  const shippingLine1 = form.watch("shippingLine1");
  const shippingCity = form.watch("shippingCity");
  const shippingAgencyName = form.watch("shippingAgencyName");

  // Compute the deposit percentage for the selected payment method
  const depositPercent = useMemo(() => {
    if (!selectedPaymentConfig) return 100;
    return typeof selectedPaymentConfig.depositPercent === "number"
      ? selectedPaymentConfig.depositPercent
      : 100;
  }, [selectedPaymentConfig]);

  // Server-equivalent delivery cost for the selected method — same
  // `Number(details?.estimatedCost ?? 0)` the use case applies before
  // computing requiredAmount.
  const deliveryCost = useMemo(() => {
    if (deliveryMethodType === "COURIER" && courierName && courierModality) {
      const courier = couriers.find((c) => c.name === courierName);
      const modality = courier?.modalities.find(
        (m) => m.modality === courierModality,
      );
      return Number(modality?.price ?? 0);
    }
    const selectedDelivery = methods.find((m) => m.type === deliveryMethodType);
    return Number(selectedDelivery?.details?.estimatedCost ?? 0);
  }, [methods, deliveryMethodType, couriers, courierName, courierModality]);

  // Whether partial payment is available: only a non-CASH electronic method
  // with an existing configuration that explicitly lowers the deposit below
  // 100 — the same rule CreateOrderUseCase enforces server-side (a PARTIAL
  // order on CASH or an ineligible config is rejected there).
  const partialAvailable =
    paymentMethod !== "CASH" &&
    selectedPaymentConfig != null &&
    depositPercent < 100;

  // Reset payment type to FULL when partial is not available
  useEffect(() => {
    if (!partialAvailable && paymentType === "PARTIAL") {
      form.setValue("paymentType", "FULL");
    }
  }, [partialAvailable, paymentType, form.setValue]);

  // Notify parent of payment type changes for summary display
  useEffect(() => {
    if (onPaymentTypeChange) {
      onPaymentTypeChange(paymentType, depositPercent);
    }
  }, [paymentType, depositPercent, onPaymentTypeChange]);

  useEffect(() => {
    onDeliveryCostChange?.(deliveryCost);
  }, [deliveryCost, onDeliveryCostChange]);

  // Prefill from the buyer's saved default address the moment it loads —
  // guests/logged-out buyers just get `null` back (query never throws into
  // the UI, see useDefaultShippingAddress) and the fields stay empty. Only
  // fills fields the buyer hasn't already typed into, so it never clobbers
  // an in-progress edit. Gated on `deliveryMethodType === "COURIER"`: the
  // shippingAddress inputs aren't mounted before then, and `setValue` on an
  // unregistered field only updates form state, not the input's DOM value —
  // so if the address query resolves first, this still needs to (re-)run
  // once the fields actually mount.
  useEffect(() => {
    if (deliveryMethodType !== "COURIER") return;
    const address = defaultAddress.data;
    if (!address) return;
    if (!form.getValues("shippingRecipientName")) {
      form.setValue("shippingRecipientName", address.recipientName);
    }
    if (!form.getValues("shippingPhone")) {
      form.setValue("shippingPhone", address.phone);
    }
    if (!form.getValues("shippingLine1")) {
      form.setValue("shippingLine1", address.line1);
    }
    if (!form.getValues("shippingLine2")) {
      form.setValue("shippingLine2", address.line2 ?? "");
    }
    if (!form.getValues("shippingCity")) {
      form.setValue("shippingCity", address.city);
    }
    if (!form.getValues("shippingRegion")) {
      form.setValue("shippingRegion", address.region ?? "");
    }
    if (!form.getValues("shippingReference")) {
      form.setValue("shippingReference", address.reference ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultAddress.data, deliveryMethodType]);

  // Prefill a logged-in buyer's saved contact info the moment it loads —
  // guests get a failed/undefined query (never thrown into the UI, see
  // useCustomerProfile) so nothing changes for guest checkout. Only fills
  // fields the buyer hasn't already typed into, same "only fill if empty"
  // guard as the shipping-address effect above — fields stay fully
  // editable, this is a one-time setValue, not a disabled/read-only field.
  useEffect(() => {
    const customer = customerProfile.data?.customer;
    if (!customer) return;
    if (!form.getValues("customerName") && customer.name) {
      form.setValue("customerName", customer.name);
    }
    if (!form.getValues("customerPhone") && customer.phone) {
      form.setValue("customerPhone", customer.phone);
    }
    if (!form.getValues("customerEmail") && customer.email) {
      form.setValue("customerEmail", customer.email);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerProfile.data]);

  // Defaults the date field to the point's next open day the moment a
  // date-requiring point becomes selected (or the pickupDate was cleared by
  // switching away and back) — matches `nextDateForWeekday`'s "next real
  // calendar date for a bare weekday index" role described on that helper.
  useEffect(() => {
    if (!pickupPointId || !pointsRequiringDate.has(pickupPointId)) return;
    if (form.getValues("pickupDate")) return;
    const point = points.find((p) => p.id === pickupPointId);
    if (!point || weekday === undefined) return;
    const availability = getPickupAvailability(point, weekday);
    if (availability.nextAvailableDay === null) return;
    const date = nextDateForWeekday(availability.nextAvailableDay, new Date());
    form.setValue("pickupDate", toDateInputValue(date));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupPointId, pointsRequiringDate, points, weekday]);

  // Blocks submit whenever the selected point needs a pickupDate that's
  // either missing or whose weekday isn't in that point's openDays — the
  // inline "pickupDateInvalidWeekday" error above is the same check. A
  // manually closed point (closedOverride, no future date to offer) always
  // blocks: the API rejects any pickupDate against it, so it must never be
  // submittable even when a stale pickupDate happens to match its openDays.
  const pickupDateBlocking =
    deliveryMethodType === "PICKUP" &&
    pickupPointId !== "" &&
    pointsRequiringDate.has(pickupPointId) &&
    (() => {
      if (!pickupDate) return true;
      const point = points.find((p) => p.id === pickupPointId);
      if (!point || weekday === undefined) return true;
      const availability = getPickupAvailability(point, weekday);
      if (availability.nextAvailableDay === null) return true;
      const selectedWeekday = new Date(`${pickupDate}T00:00:00Z`).getUTCDay();
      return (
        point.openDays.length > 0 && !point.openDays.includes(selectedWeekday)
      );
    })();

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await submitCheckout.mutateAsync({
      deliveryMethodType: values.deliveryMethodType,
      pickupPointId:
        values.deliveryMethodType === "PICKUP"
          ? values.pickupPointId
          : undefined,
      pickupDate:
        values.deliveryMethodType === "PICKUP" &&
        pointsRequiringDate.has(values.pickupPointId)
          ? values.pickupDate
          : undefined,
      paymentMethod: values.paymentMethod || undefined,
      paymentType: values.paymentType,
      customerName: values.customerName,
      customerPhone: values.customerPhone,
      customerEmail: values.customerEmail,
      paymentProof: values.paymentProof,
      courierName:
        values.deliveryMethodType === "COURIER"
          ? values.courierName
          : undefined,
      courierModality:
        values.deliveryMethodType === "COURIER"
          ? (values.courierModality as "AGENCY" | "HOME")
          : undefined,
      shippingAddress:
        values.deliveryMethodType === "COURIER"
          ? {
              recipientName: values.shippingRecipientName,
              recipientSurnames: values.shippingRecipientSurnames || undefined,
              phone: values.shippingPhone,
              documentType: (values.shippingDocumentType || undefined) as
                "DNI" | "CE" | "RUC" | "PASSPORT" | undefined,
              documentNumber: values.shippingDocumentNumber || undefined,
              department: values.shippingDepartment || undefined,
              province: values.shippingProvince || undefined,
              district: values.shippingDistrict || undefined,
              agencyName:
                values.courierModality === "AGENCY"
                  ? values.shippingAgencyName
                  : undefined,
              line1:
                values.courierModality === "HOME"
                  ? values.shippingLine1
                  : undefined,
              line2: values.shippingLine2 || undefined,
              city: values.shippingCity || undefined,
              region: values.shippingRegion || undefined,
              reference: values.shippingReference || undefined,
            }
          : undefined,
      items,
    });
    onOrderCreated({
      orderId: result.order.id,
      customerEmail: values.customerEmail,
      paymentMethod: result.order.paymentMethod,
      requiredAmount: result.order.requiredAmount,
      totalAmount: result.order.totalAmount,
      currency: result.order.currency,
      whatsappUrl: result.whatsappUrl,
    });
  });

  const weekdays = weekdayLabels(t);
  const paymentLabels = paymentMethodLabels(t);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <nav
        aria-label="breadcrumb"
        className="flex items-center gap-2 text-xs font-medium text-gray-400"
      >
        <span>{t("breadcrumb.store")}</span>
        <span aria-hidden="true">›</span>
        <span className="store-theme-active-text flex items-center gap-1">
          {t("breadcrumb.cart")}
          <Check className="size-3" strokeWidth={3} />
        </span>
        <span aria-hidden="true">›</span>
        <span className="font-semibold text-gray-900">
          {t("breadcrumb.confirm")}
        </span>
      </nav>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-5">
        {methods.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {t("deliveryTypeLabel")}
            </span>
            <div className="grid grid-cols-2 gap-3">
              {methods.map((m) => (
                <SelectableCard
                  key={m.type}
                  selected={deliveryMethodType === m.type}
                  onSelect={() =>
                    form.setValue("deliveryMethodType", m.type, {
                      shouldValidate: true,
                    })
                  }
                  icon={
                    m.type === "PICKUP" ? (
                      <Store className="size-5" />
                    ) : (
                      <Truck className="size-5" />
                    )
                  }
                  title={
                    m.type === "PICKUP"
                      ? t("deliveryPickup")
                      : t("deliveryCourier")
                  }
                />
              ))}
            </div>
          </div>
        )}

        {deliveryMethodType === "PICKUP" && points.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {t("pickupPointsLabel")}
            </span>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {points.map((point) => {
                // `points` is only non-empty once deliveryOptions.data has
                // loaded, so `weekday` (sourced from that same payload) is
                // defined here. Cards are always clickable now — a
                // closed-today point is a valid, completable selection once
                // it has a pickupDate, so it's no longer `disabled`.
                const availability = getPickupAvailability(point, weekday);
                return (
                  <SelectableCard
                    key={point.id}
                    selected={pickupPointId === point.id}
                    onSelect={() =>
                      form.setValue("pickupPointId", point.id, {
                        shouldValidate: true,
                      })
                    }
                    title={point.label}
                    subtitle={
                      availability.availableToday
                        ? t("availableToday")
                        : availability.nextAvailableDay !== null
                          ? t("nextAvailable", {
                              day: weekdays[availability.nextAvailableDay],
                            })
                          : t("pickupNoAvailability")
                    }
                  />
                );
              })}
            </div>

            {pickupPointId &&
              pointsRequiringDate.has(pickupPointId) &&
              (() => {
                const selectedPoint = points.find(
                  (p) => p.id === pickupPointId,
                );
                if (!selectedPoint || weekday === undefined) return null;
                const availability = getPickupAvailability(
                  selectedPoint,
                  weekday,
                );
                if (availability.nextAvailableDay === null) {
                  return (
                    <p className="text-sm text-amber-600">
                      {t("pickupNoAvailability")}
                    </p>
                  );
                }
                const selectedWeekday = pickupDate
                  ? new Date(`${pickupDate}T00:00:00Z`).getUTCDay()
                  : undefined;
                const invalidWeekday =
                  selectedWeekday !== undefined &&
                  selectedPoint.openDays.length > 0 &&
                  !selectedPoint.openDays.includes(selectedWeekday);
                return (
                  <div className="flex flex-col gap-1">
                    <label
                      htmlFor="pickup-date-input"
                      className="text-xs font-semibold uppercase tracking-wide text-gray-400"
                    >
                      {t("pickupDateLabel")}
                    </label>
                    <Controller
                      control={form.control}
                      name="pickupDate"
                      render={({ field }) => (
                        <input
                          id="pickup-date-input"
                          type="date"
                          min={toDateInputValue(new Date())}
                          className={inputClassName}
                          value={field.value}
                          onChange={field.onChange}
                        />
                      )}
                    />
                    {invalidWeekday ? (
                      <p className="text-sm text-red-500">
                        {t("pickupDateInvalidWeekday")}
                      </p>
                    ) : (
                      form.formState.errors.pickupDate && (
                        <p className="text-sm text-red-500">
                          {t("pickupDateRequired")}
                        </p>
                      )
                    )}
                  </div>
                );
              })()}
          </div>
        )}

        {deliveryMethodType === "COURIER" && (
          <div className="flex flex-col gap-3">
            {couriers.length > 0 && (
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {t("courierSelectLabel")}
                </span>
                <select
                  className={inputClassName}
                  aria-label={t("courierSelectLabel")}
                  value={courierName}
                  onChange={(e) => {
                    form.setValue("courierName", e.target.value, {
                      shouldValidate: true,
                    });
                    form.setValue("courierModality", "", {
                      shouldValidate: true,
                    });
                  }}
                >
                  <option value="">{t("courierSelectPlaceholder")}</option>
                  {couriers.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
                {form.formState.errors.courierName && (
                  <p className="text-sm text-red-500">
                    {t("courierSelectRequired")}
                  </p>
                )}
              </div>
            )}

            {courierName &&
              (() => {
                const courier = couriers.find((c) => c.name === courierName);
                const modalities = courier?.modalities ?? [];
                if (modalities.length === 0) return null;
                return (
                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                      {t("courierModalityLabel")}
                    </span>
                    <div className="grid grid-cols-2 gap-3">
                      {modalities.some((m) => m.modality === "AGENCY") && (
                        <SelectableCard
                          selected={courierModality === "AGENCY"}
                          onSelect={() =>
                            form.setValue("courierModality", "AGENCY", {
                              shouldValidate: true,
                            })
                          }
                          icon={<Store className="size-5" />}
                          title={t("courierModalityAgency")}
                        />
                      )}
                      {modalities.some((m) => m.modality === "HOME") && (
                        <SelectableCard
                          selected={courierModality === "HOME"}
                          onSelect={() =>
                            form.setValue("courierModality", "HOME", {
                              shouldValidate: true,
                            })
                          }
                          icon={<Home className="size-5" />}
                          title={t("courierModalityHome")}
                        />
                      )}
                    </div>
                    {form.formState.errors.courierModality && (
                      <p className="text-sm text-red-500">
                        {t("courierModalityRequired")}
                      </p>
                    )}
                  </div>
                );
              })()}

            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {t("shippingAddressLabel")}
            </span>

            {courierModality === "AGENCY" && (
              <input
                placeholder={t("shippingAgencyNamePlaceholder")}
                className={inputClassName}
                {...form.register("shippingAgencyName")}
              />
            )}
            {form.formState.errors.shippingAgencyName && (
              <p className="text-sm text-red-500">
                {t("courierAgencyNameRequired")}
              </p>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <input
                placeholder={t("shippingRecipientNamePlaceholder")}
                className={inputClassName}
                {...form.register("shippingRecipientName")}
              />
              <input
                placeholder={t("shippingRecipientSurnamesPlaceholder")}
                className={inputClassName}
                {...form.register("shippingRecipientSurnames")}
              />
            </div>
            {form.formState.errors.shippingRecipientName && (
              <p className="text-sm text-red-500">
                {t("shippingRecipientNameRequired")}
              </p>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <select
                className={inputClassName}
                aria-label={t("shippingDocumentTypePlaceholder")}
                {...form.register("shippingDocumentType")}
              >
                <option value="">{t("shippingDocumentTypePlaceholder")}</option>
                <option value="DNI">DNI</option>
                <option value="CE">Carnet de Extranjería</option>
                <option value="RUC">RUC</option>
                <option value="PASSPORT">Pasaporte</option>
              </select>
              <input
                placeholder={t("shippingDocumentNumberPlaceholder")}
                className={inputClassName}
                {...form.register("shippingDocumentNumber")}
              />
            </div>

            <input
              placeholder={t("shippingPhonePlaceholder")}
              className={inputClassName}
              {...form.register("shippingPhone")}
            />
            {form.formState.errors.shippingPhone && (
              <p className="text-sm text-red-500">
                {t("shippingPhoneRequired")}
              </p>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <input
                placeholder={t("shippingDepartmentPlaceholder")}
                className={inputClassName}
                {...form.register("shippingDepartment")}
              />
              <input
                placeholder={t("shippingProvincePlaceholder")}
                className={inputClassName}
                {...form.register("shippingProvince")}
              />
              <input
                placeholder={t("shippingDistrictPlaceholder")}
                className={inputClassName}
                {...form.register("shippingDistrict")}
              />
            </div>

            {courierModality === "HOME" && (
              <>
                <input
                  placeholder={t("shippingLine1Placeholder")}
                  className={inputClassName}
                  {...form.register("shippingLine1")}
                />
                {form.formState.errors.shippingLine1 && (
                  <p className="text-sm text-red-500">
                    {t("shippingAddressRequired")}
                  </p>
                )}

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <input
                    placeholder={t("shippingCityPlaceholder")}
                    className={inputClassName}
                    {...form.register("shippingCity")}
                  />
                  <input
                    placeholder={t("shippingRegionPlaceholder")}
                    className={inputClassName}
                    {...form.register("shippingRegion")}
                  />
                </div>
                {form.formState.errors.shippingCity && (
                  <p className="text-sm text-red-500">
                    {t("shippingCityRequired")}
                  </p>
                )}

                <input
                  placeholder={t("shippingReferencePlaceholder")}
                  className={inputClassName}
                  {...form.register("shippingReference")}
                />
              </>
            )}
          </div>
        )}

        {paymentMethods.length > 0 && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {t("paymentMethodLabel")}
            </span>
            <div className="grid grid-cols-2 gap-3">
              {paymentMethods.map((method) => (
                <SelectableCard
                  key={method.method}
                  selected={paymentMethod === method.method}
                  onSelect={() =>
                    form.setValue("paymentMethod", method.method, {
                      shouldValidate: true,
                    })
                  }
                  icon={PAYMENT_METHOD_ICONS[method.method]}
                  title={paymentLabels[method.method] ?? method.method}
                />
              ))}
            </div>
          </div>
        )}

        {partialAvailable && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
              {t("paymentTypeLabel")}
            </span>
            <div className="grid grid-cols-2 gap-3">
              <SelectableCard
                selected={paymentType === "FULL"}
                onSelect={() =>
                  form.setValue("paymentType", "FULL", {
                    shouldValidate: true,
                  })
                }
                icon={<Wallet className="size-5" />}
                title={t("paymentTypeFull")}
                subtitle={t("paymentTypeFullSubtext")}
              />
              <SelectableCard
                selected={paymentType === "PARTIAL"}
                onSelect={() =>
                  form.setValue("paymentType", "PARTIAL", {
                    shouldValidate: true,
                  })
                }
                icon={<Percent className="size-5" />}
                title={t("paymentTypePartial")}
                subtitle={t("paymentTypePartialSubtext", {
                  percent: depositPercent,
                })}
              />
            </div>
          </div>
        )}

        {paymentMethod && selectedPaymentConfig && (
          <PaymentMethodDetails method={selectedPaymentConfig} />
        )}

        {paymentMethod &&
          paymentMethod !== "CASH" &&
          selectedMethodConfigured && (
            <div className="flex flex-col gap-2">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                {t("paymentProofUploadLabel")}
              </span>
              <Controller
                control={form.control}
                name="paymentProof"
                render={({ field }) => (
                  <PaymentProofUpload
                    value={field.value}
                    onChange={field.onChange}
                  />
                )}
              />
              {form.formState.errors.paymentProof && (
                <p className="text-sm text-red-500">
                  {form.formState.errors.paymentProof.message ===
                  "file too large"
                    ? t("paymentProofTooLarge")
                    : form.formState.errors.paymentProof.message ===
                        "invalid file type"
                      ? t("paymentProofInvalidFormat")
                      : t("paymentProofRequired")}
                </p>
              )}
            </div>
          )}

        <input
          placeholder={t("namePlaceholder")}
          className={inputClassName}
          {...form.register("customerName")}
        />

        <Controller
          control={form.control}
          name="customerPhone"
          render={({ field }) => (
            <PhoneInput
              value={field.value}
              onChange={field.onChange}
              placeholder={t("phonePlaceholder")}
              selectClassName={inputClassName}
              inputClassName={inputClassName}
            />
          )}
        />

        <input
          placeholder={t("emailPlaceholder")}
          className={inputClassName}
          {...form.register("customerEmail")}
        />
        {form.formState.errors.customerEmail && (
          <p className="text-sm text-red-500">{t("invalidEmail")}</p>
        )}
      </div>

      {submitCheckout.error && (
        <p className="text-sm text-red-500">
          {submitCheckout.error instanceof Error
            ? submitCheckout.error.message
            : String(submitCheckout.error)}
        </p>
      )}

      {deliveryMethodsLoaded && methods.length === 0 && (
        <p className="text-sm text-amber-600">{t("noDeliveryMethod")}</p>
      )}

      {mixedCurrencies && (
        <p className="text-sm text-amber-600">{t("mixedCurrencyWarning")}</p>
      )}

      <button
        type="submit"
        disabled={
          submitCheckout.isPending ||
          !customerPhone ||
          !deliveryMethodType ||
          mixedCurrencies ||
          (deliveryMethodType === "PICKUP" &&
            points.length > 0 &&
            !pickupPointId) ||
          pickupDateBlocking ||
          (paymentMethods.length > 0 && !paymentMethod) ||
          (paymentMethod !== "" &&
            paymentMethod !== "CASH" &&
            selectedMethodConfigured &&
            !paymentProof) ||
          (deliveryMethodType === "COURIER" &&
            (!courierName ||
              !courierModality ||
              !shippingRecipientName ||
              !shippingPhone ||
              (courierModality === "HOME" &&
                (!shippingLine1 || !shippingCity)) ||
              (courierModality === "AGENCY" && !shippingAgencyName)))
        }
        className="store-theme-primary-button flex flex-col items-center gap-1 rounded-xl px-5 py-4 transition disabled:opacity-60"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <MessageCircle className="size-4" />
          {submitCheckout.isPending ? t("submitting") : t("submit")}
        </span>
        <span className="text-xs font-normal opacity-80">
          {paymentMethod === "CASH"
            ? t("submitSubtextCash")
            : paymentMethod !== "" && !selectedMethodConfigured
              ? t("submitSubtextCoordinate")
              : t("submitSubtext")}
        </span>
      </button>
    </form>
  );
}
