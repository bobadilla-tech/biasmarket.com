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
import {
  FormErrorSummary,
  FormField,
  formErrorMessage,
} from "@/components/shared/form-a11y";
import { type CartItem, hasMixedCurrencies } from "@/lib/cart";
import { useDeliveryOptions } from "../queries/use-delivery-options";
import { useDefaultShippingAddress } from "../queries/use-default-shipping-address";
import { useCustomerProfile } from "@/features/customer-auth";
import { useSubmitCheckout } from "../mutations/use-submit-checkout";
import {
  getPickupAvailability,
  nextDateForWeekday,
} from "../lib/pickup-availability";
import {
  RadioCard,
  RadioCardGroup,
  RadioCardIndicator,
} from "@/components/ui/radio-card-group";
import { PaymentMethodDetails } from "./payment-method-details";
import { PaymentProofUpload } from "./payment-proof-upload";
import {
  buildCheckoutFormSchema,
  type CheckoutFormInput,
} from "@biasmarket/validation";

const inputClassName =
  "store-theme-input rounded-xl border border-gray-200 px-4 py-2.5 text-base text-gray-600 outline-none md:text-sm";

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
  const tCommon = useTranslations("common");
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
  const checkoutErrors = Object.values(form.formState.errors)
    .map((error) => error?.message)
    .filter((message): message is string => typeof message === "string");
  const submitError =
    submitCheckout.error instanceof Error
      ? submitCheckout.error.message
      : submitCheckout.error
        ? String(submitCheckout.error)
        : undefined;

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
      paymentProof: values.paymentProof as File | null,
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
                "DNI" | "PASSPORT" | undefined,
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
      <FormErrorSummary
        id="checkout-error-summary"
        title={tCommon("formErrorsSummary")}
        messages={[
          checkoutErrors.length > 0 ? tCommon("formErrorsSummary") : "",
          submitError ?? "",
        ].filter(Boolean)}
      />
      <nav
        aria-label="breadcrumb"
        className="flex items-center gap-2 text-xs font-medium text-gray-400"
      >
        <ol className="flex items-center gap-2">
          <li>{t("breadcrumb.store")}</li>
          <li aria-hidden="true">›</li>
          <li className="store-theme-active-text flex items-center gap-1">
            {t("breadcrumb.cart")}
            <Check aria-hidden="true" className="size-3" strokeWidth={3} />
          </li>
          <li aria-hidden="true">›</li>
          <li aria-current="step" className="font-semibold text-gray-900">
            {t("breadcrumb.confirm")}
          </li>
        </ol>
      </nav>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-5">
        {methods.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2
              id="checkout-delivery-type-label"
              className="text-sm font-semibold text-foreground"
            >
              {t("deliveryTypeLabel")}
            </h2>
            <Controller
              control={form.control}
              name="deliveryMethodType"
              render={({ field }) => (
                <RadioCardGroup
                  name={field.name}
                  value={field.value}
                  onValueChange={(value) =>
                    field.onChange(
                      value as CheckoutFormInput["deliveryMethodType"],
                    )
                  }
                  aria-labelledby="checkout-delivery-type-label"
                  aria-describedby={
                    form.formState.errors.deliveryMethodType
                      ? "checkout-delivery-type-error"
                      : undefined
                  }
                  className="grid grid-cols-2 gap-3"
                >
                  {methods.map((m) => (
                    <RadioCard
                      key={m.type}
                      value={m.type}
                      aria-label={
                        m.type === "PICKUP"
                          ? t("deliveryPickup")
                          : t("deliveryCourier")
                      }
                    >
                      {m.type === "PICKUP" ? (
                        <Store aria-hidden="true" className="size-5" />
                      ) : (
                        <Truck aria-hidden="true" className="size-5" />
                      )}
                      <span className="pr-6 text-sm font-semibold">
                        {m.type === "PICKUP"
                          ? t("deliveryPickup")
                          : t("deliveryCourier")}
                      </span>
                      <RadioCardIndicator>
                        <Check
                          aria-hidden="true"
                          className="size-3"
                          strokeWidth={3}
                        />
                      </RadioCardIndicator>
                    </RadioCard>
                  ))}
                </RadioCardGroup>
              )}
            />
            {form.formState.errors.deliveryMethodType && (
              <p
                id="checkout-delivery-type-error"
                role="alert"
                className="text-sm text-error-foreground"
              >
                {t("deliveryTypeLabel")}
              </p>
            )}
          </div>
        )}

        {deliveryMethodType === "PICKUP" && points.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2
              id="checkout-pickup-point-label"
              className="text-sm font-semibold text-foreground"
            >
              {t("pickupPointsLabel")}
            </h2>
            <Controller
              control={form.control}
              name="pickupPointId"
              render={({ field }) => (
                <RadioCardGroup
                  name={field.name}
                  value={field.value}
                  onValueChange={(value) => field.onChange(value)}
                  aria-labelledby="checkout-pickup-point-label"
                  aria-describedby={
                    form.formState.errors.pickupPointId
                      ? "checkout-pickup-point-error"
                      : undefined
                  }
                  className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                >
                  {points.map((point) => {
                    // `points` is only non-empty once deliveryOptions.data has
                    // loaded, so `weekday` (sourced from that same payload) is
                    // defined here. Cards are always clickable now — a
                    // closed-today point is a valid, completable selection once
                    // it has a pickupDate, so it's no longer `disabled`.
                    const availability = getPickupAvailability(point, weekday);
                    return (
                      <RadioCard
                        key={point.id}
                        value={point.id}
                        aria-label={point.label}
                      >
                        <span className="pr-6 text-sm font-semibold">
                          {point.label}
                        </span>
                        <span className="text-xs text-gray-500">
                          {availability.availableToday
                            ? t("availableToday")
                            : availability.nextAvailableDay !== null
                              ? t("nextAvailable", {
                                  day: weekdays[availability.nextAvailableDay],
                                })
                              : t("pickupNoAvailability")}
                        </span>
                        <RadioCardIndicator>
                          <Check
                            aria-hidden="true"
                            className="size-3"
                            strokeWidth={3}
                          />
                        </RadioCardIndicator>
                      </RadioCard>
                    );
                  })}
                </RadioCardGroup>
              )}
            />
            {form.formState.errors.pickupPointId && (
              <p
                id="checkout-pickup-point-error"
                role="alert"
                className="text-sm text-error-foreground"
              >
                {t("pickupPointsLabel")}
              </p>
            )}

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
                  <FormField
                    id="pickup-date-input"
                    label={t("pickupDateLabel")}
                    error={
                      invalidWeekday
                        ? t("pickupDateInvalidWeekday")
                        : formErrorMessage(
                            form.formState.errors.pickupDate,
                            t("pickupDateRequired"),
                          )
                    }
                  >
                    {(props) => (
                      <Controller
                        control={form.control}
                        name="pickupDate"
                        render={({ field }) => (
                          <input
                            {...props}
                            id="pickup-date-input"
                            type="date"
                            min={toDateInputValue(new Date())}
                            className={inputClassName}
                            value={field.value}
                            onChange={field.onChange}
                          />
                        )}
                      />
                    )}
                  </FormField>
                );
              })()}
          </div>
        )}

        {deliveryMethodType === "COURIER" && (
          <div className="flex flex-col gap-3">
            {couriers.length > 0 && (
              <FormField
                id="checkout-courier-name"
                label={t("courierSelectLabel")}
                error={formErrorMessage(
                  form.formState.errors.courierName,
                  t("courierSelectRequired"),
                )}
              >
                {(props) => (
                  <select
                    {...props}
                    className={inputClassName}
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
                )}
              </FormField>
            )}

            {courierName &&
              (() => {
                const courier = couriers.find((c) => c.name === courierName);
                const modalities = courier?.modalities ?? [];
                if (modalities.length === 0) return null;
                return (
                  <div className="flex flex-col gap-2">
                    <h3
                      id="checkout-courier-modality-label"
                      className="text-sm font-semibold text-foreground"
                    >
                      {t("courierModalityLabel")}
                    </h3>
                    <Controller
                      control={form.control}
                      name="courierModality"
                      render={({ field }) => (
                        <RadioCardGroup
                          name={field.name}
                          value={field.value}
                          onValueChange={(value) => field.onChange(value)}
                          aria-labelledby="checkout-courier-modality-label"
                          aria-describedby={
                            form.formState.errors.courierModality
                              ? "checkout-courier-modality-error"
                              : undefined
                          }
                          className="grid grid-cols-2 gap-3"
                        >
                          {modalities.some((m) => m.modality === "AGENCY") && (
                            <RadioCard
                              value="AGENCY"
                              aria-label={t("courierModalityAgency")}
                            >
                              <Store aria-hidden="true" className="size-5" />
                              <span className="pr-6 text-sm font-semibold">
                                {t("courierModalityAgency")}
                              </span>
                              <RadioCardIndicator>
                                <Check
                                  aria-hidden="true"
                                  className="size-3"
                                  strokeWidth={3}
                                />
                              </RadioCardIndicator>
                            </RadioCard>
                          )}
                          {modalities.some((m) => m.modality === "HOME") && (
                            <RadioCard
                              value="HOME"
                              aria-label={t("courierModalityHome")}
                            >
                              <Home aria-hidden="true" className="size-5" />
                              <span className="pr-6 text-sm font-semibold">
                                {t("courierModalityHome")}
                              </span>
                              <RadioCardIndicator>
                                <Check
                                  aria-hidden="true"
                                  className="size-3"
                                  strokeWidth={3}
                                />
                              </RadioCardIndicator>
                            </RadioCard>
                          )}
                        </RadioCardGroup>
                      )}
                    />
                    {form.formState.errors.courierModality && (
                      <p
                        id="checkout-courier-modality-error"
                        role="alert"
                        className="text-sm text-error-foreground"
                      >
                        {t("courierModalityRequired")}
                      </p>
                    )}
                  </div>
                );
              })()}

            <h3 className="text-sm font-semibold text-foreground">
              {t("shippingAddressLabel")}
            </h3>

            {courierModality === "AGENCY" && (
              <FormField
                id="checkout-shipping-agency"
                label={t("shippingAgencyNamePlaceholder")}
                error={formErrorMessage(
                  form.formState.errors.shippingAgencyName,
                  t("courierAgencyNameRequired"),
                )}
              >
                {(props) => (
                  <input
                    {...props}
                    placeholder={t("shippingAgencyNamePlaceholder")}
                    className={inputClassName}
                    {...form.register("shippingAgencyName")}
                  />
                )}
              </FormField>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField
                id="checkout-shipping-recipient-name"
                label={t("shippingRecipientNamePlaceholder")}
                error={formErrorMessage(
                  form.formState.errors.shippingRecipientName,
                  t("shippingRecipientNameRequired"),
                )}
              >
                {(props) => (
                  <input
                    {...props}
                    autoComplete="given-name"
                    placeholder={t("shippingRecipientNamePlaceholder")}
                    className={inputClassName}
                    {...form.register("shippingRecipientName")}
                  />
                )}
              </FormField>
              <FormField
                id="checkout-shipping-recipient-surnames"
                label={t("shippingRecipientSurnamesPlaceholder")}
              >
                {(props) => (
                  <input
                    {...props}
                    autoComplete="family-name"
                    placeholder={t("shippingRecipientSurnamesPlaceholder")}
                    className={inputClassName}
                    {...form.register("shippingRecipientSurnames")}
                  />
                )}
              </FormField>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <FormField
                id="checkout-shipping-document-type"
                label={t("shippingDocumentTypePlaceholder")}
              >
                {(props) => (
                  <select
                    {...props}
                    className={inputClassName}
                    {...form.register("shippingDocumentType")}
                  >
                    <option value="">
                      {t("shippingDocumentTypePlaceholder")}
                    </option>
                    <option value="DNI">DNI</option>
                    <option value="CE">Carnet de Extranjería</option>
                    <option value="RUC">RUC</option>
                    <option value="PASSPORT">Pasaporte</option>
                  </select>
                )}
              </FormField>
              <FormField
                id="checkout-shipping-document-number"
                label={t("shippingDocumentNumberPlaceholder")}
              >
                {(props) => (
                  <input
                    {...props}
                    inputMode="numeric"
                    placeholder={t("shippingDocumentNumberPlaceholder")}
                    className={inputClassName}
                    {...form.register("shippingDocumentNumber")}
                  />
                )}
              </FormField>
            </div>

            <FormField
              id="checkout-shipping-phone"
              label={t("shippingPhonePlaceholder")}
              error={formErrorMessage(
                form.formState.errors.shippingPhone,
                t("shippingPhoneRequired"),
              )}
            >
              {(props) => (
                <input
                  {...props}
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  placeholder={t("shippingPhonePlaceholder")}
                  className={inputClassName}
                  {...form.register("shippingPhone")}
                />
              )}
            </FormField>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <FormField
                id="checkout-shipping-department"
                label={t("shippingDepartmentPlaceholder")}
              >
                {(props) => (
                  <input
                    {...props}
                    autoComplete="address-level1"
                    placeholder={t("shippingDepartmentPlaceholder")}
                    className={inputClassName}
                    {...form.register("shippingDepartment")}
                  />
                )}
              </FormField>
              <FormField
                id="checkout-shipping-province"
                label={t("shippingProvincePlaceholder")}
              >
                {(props) => (
                  <input
                    {...props}
                    placeholder={t("shippingProvincePlaceholder")}
                    className={inputClassName}
                    {...form.register("shippingProvince")}
                  />
                )}
              </FormField>
              <FormField
                id="checkout-shipping-district"
                label={t("shippingDistrictPlaceholder")}
              >
                {(props) => (
                  <input
                    {...props}
                    autoComplete="address-level2"
                    placeholder={t("shippingDistrictPlaceholder")}
                    className={inputClassName}
                    {...form.register("shippingDistrict")}
                  />
                )}
              </FormField>
            </div>

            {courierModality === "HOME" && (
              <>
                <FormField
                  id="checkout-shipping-line1"
                  label={t("shippingLine1Placeholder")}
                  error={formErrorMessage(
                    form.formState.errors.shippingLine1,
                    t("shippingAddressRequired"),
                  )}
                >
                  {(props) => (
                    <input
                      {...props}
                      autoComplete="street-address"
                      placeholder={t("shippingLine1Placeholder")}
                      className={inputClassName}
                      {...form.register("shippingLine1")}
                    />
                  )}
                </FormField>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <FormField
                    id="checkout-shipping-city"
                    label={t("shippingCityPlaceholder")}
                    error={formErrorMessage(
                      form.formState.errors.shippingCity,
                      t("shippingCityRequired"),
                    )}
                  >
                    {(props) => (
                      <input
                        {...props}
                        autoComplete="address-level2"
                        placeholder={t("shippingCityPlaceholder")}
                        className={inputClassName}
                        {...form.register("shippingCity")}
                      />
                    )}
                  </FormField>
                  <FormField
                    id="checkout-shipping-region"
                    label={t("shippingRegionPlaceholder")}
                  >
                    {(props) => (
                      <input
                        {...props}
                        autoComplete="address-level1"
                        placeholder={t("shippingRegionPlaceholder")}
                        className={inputClassName}
                        {...form.register("shippingRegion")}
                      />
                    )}
                  </FormField>
                </div>
                <FormField
                  id="checkout-shipping-reference"
                  label={t("shippingReferencePlaceholder")}
                >
                  {(props) => (
                    <input
                      {...props}
                      placeholder={t("shippingReferencePlaceholder")}
                      className={inputClassName}
                      {...form.register("shippingReference")}
                    />
                  )}
                </FormField>
              </>
            )}
          </div>
        )}

        {paymentMethods.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2
              id="checkout-payment-method-label"
              className="text-sm font-semibold text-foreground"
            >
              {t("paymentMethodLabel")}
            </h2>
            <Controller
              control={form.control}
              name="paymentMethod"
              render={({ field }) => (
                <RadioCardGroup
                  name={field.name}
                  value={field.value}
                  onValueChange={(value) => field.onChange(value)}
                  aria-labelledby="checkout-payment-method-label"
                  aria-describedby={
                    form.formState.errors.paymentMethod
                      ? "checkout-payment-method-error"
                      : undefined
                  }
                  className="grid grid-cols-2 gap-3"
                >
                  {paymentMethods.map((method) => (
                    <RadioCard
                      key={method.method}
                      value={method.method}
                      aria-label={paymentLabels[method.method] ?? method.method}
                    >
                      {PAYMENT_METHOD_ICONS[method.method]}
                      <span className="pr-6 text-sm font-semibold">
                        {paymentLabels[method.method] ?? method.method}
                      </span>
                      <RadioCardIndicator>
                        <Check
                          aria-hidden="true"
                          className="size-3"
                          strokeWidth={3}
                        />
                      </RadioCardIndicator>
                    </RadioCard>
                  ))}
                </RadioCardGroup>
              )}
            />
            {form.formState.errors.paymentMethod && (
              <p
                id="checkout-payment-method-error"
                role="alert"
                className="text-sm text-error-foreground"
              >
                {t("paymentMethodLabel")}
              </p>
            )}
          </div>
        )}

        {partialAvailable && (
          <div className="flex flex-col gap-2">
            <h2
              id="checkout-payment-type-label"
              className="text-sm font-semibold text-foreground"
            >
              {t("paymentTypeLabel")}
            </h2>
            <Controller
              control={form.control}
              name="paymentType"
              render={({ field }) => (
                <RadioCardGroup
                  name={field.name}
                  value={field.value}
                  onValueChange={(value) => field.onChange(value)}
                  aria-labelledby="checkout-payment-type-label"
                  className="grid grid-cols-2 gap-3"
                >
                  <RadioCard value="FULL" aria-label={t("paymentTypeFull")}>
                    <Wallet aria-hidden="true" className="size-5" />
                    <span className="pr-6 text-sm font-semibold">
                      {t("paymentTypeFull")}
                    </span>
                    <span className="text-xs text-gray-500">
                      {t("paymentTypeFullSubtext")}
                    </span>
                    <RadioCardIndicator>
                      <Check
                        aria-hidden="true"
                        className="size-3"
                        strokeWidth={3}
                      />
                    </RadioCardIndicator>
                  </RadioCard>
                  <RadioCard
                    value="PARTIAL"
                    aria-label={t("paymentTypePartial")}
                  >
                    <Percent aria-hidden="true" className="size-5" />
                    <span className="pr-6 text-sm font-semibold">
                      {t("paymentTypePartial")}
                    </span>
                    <span className="text-xs text-gray-500">
                      {t("paymentTypePartialSubtext", {
                        percent: depositPercent,
                      })}
                    </span>
                    <RadioCardIndicator>
                      <Check
                        aria-hidden="true"
                        className="size-3"
                        strokeWidth={3}
                      />
                    </RadioCardIndicator>
                  </RadioCard>
                </RadioCardGroup>
              )}
            />
          </div>
        )}

        {paymentMethod && selectedPaymentConfig && (
          <PaymentMethodDetails method={selectedPaymentConfig} />
        )}

        {paymentMethod &&
          paymentMethod !== "CASH" &&
          selectedMethodConfigured && (
            <FormField
              id="checkout-payment-proof"
              label={t("paymentProofUploadLabel")}
              error={formErrorMessage(
                form.formState.errors.paymentProof,
                t("paymentProofRequired"),
              )}
            >
              {(props) => (
                <Controller
                  control={form.control}
                  name="paymentProof"
                  render={({ field }) => (
                    <PaymentProofUpload
                      {...props}
                      value={field.value as File | null}
                      onChange={field.onChange}
                    />
                  )}
                />
              )}
            </FormField>
          )}

        <FormField
          id="checkout-customer-name"
          label={t("namePlaceholder")}
          error={formErrorMessage(
            form.formState.errors.customerName,
            t("namePlaceholder"),
          )}
        >
          {(props) => (
            <input
              {...props}
              autoComplete="name"
              placeholder={t("namePlaceholder")}
              className={inputClassName}
              {...form.register("customerName")}
            />
          )}
        </FormField>

        <FormField
          id="checkout-customer-phone"
          label={t("phonePlaceholder")}
          error={formErrorMessage(
            form.formState.errors.customerPhone,
            t("phonePlaceholder"),
          )}
        >
          {(props) => (
            <Controller
              control={form.control}
              name="customerPhone"
              render={({ field }) => (
                <PhoneInput
                  {...props}
                  value={field.value}
                  onChange={field.onChange}
                  placeholder={t("phonePlaceholder")}
                  selectClassName={inputClassName}
                  inputClassName={inputClassName}
                  countryId="checkout-customer-phone-country"
                />
              )}
            />
          )}
        </FormField>

        <FormField
          id="checkout-customer-email"
          label={t("emailPlaceholder")}
          error={formErrorMessage(
            form.formState.errors.customerEmail,
            t("invalidEmail"),
          )}
        >
          {(props) => (
            <input
              {...props}
              type="email"
              inputMode="email"
              autoComplete="email"
              placeholder={t("emailPlaceholder")}
              className={inputClassName}
              {...form.register("customerEmail")}
            />
          )}
        </FormField>
      </div>

      {submitCheckout.error && (
        <p role="alert" className="text-sm text-red-500">
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
