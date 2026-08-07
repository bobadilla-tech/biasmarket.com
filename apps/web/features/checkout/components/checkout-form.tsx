"use client";

import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import {
  Banknote,
  Check,
  Landmark,
  MessageCircle,
  Smartphone,
  Store,
  Truck,
} from "lucide-react";
import { PhoneInput } from "@/components/ui/phone-input";
import { type CartItem, hasMixedCurrencies } from "@/lib/cart";
import { useDeliveryOptions } from "../queries/use-delivery-options";
import { useSubmitCheckout } from "../mutations/use-submit-checkout";
import {
  getPickupAvailability,
  nextDateForWeekday,
} from "../lib/pickup-availability";
import { SelectableCard } from "./selectable-card";
import {
  buildCheckoutFormSchema,
  type CheckoutFormInput,
} from "../schemas/checkout.schema";

const inputClassName =
  "store-theme-input rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none";

const PAYMENT_METHOD_ICONS: Record<string, React.ReactNode> = {
  YAPE: <Smartphone className="size-5" />,
  PLIN: <Smartphone className="size-5" />,
  TRANSFER: <Landmark className="size-5" />,
  CASH: <Banknote className="size-5" />,
};

interface CheckoutFormProps {
  slug: string;
  items: CartItem[];
  onOrderCreated: (result: { orderId: string; customerEmail: string }) => void;
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

export function CheckoutForm(
  { slug, items, onOrderCreated }: CheckoutFormProps,
) {
  const t = useTranslations("storefront.checkoutPage");
  const deliveryOptions = useDeliveryOptions(slug);
  const submitCheckout = useSubmitCheckout(slug);

  const methods = deliveryOptions.data?.methods ?? [];
  const points = deliveryOptions.data?.points ?? [];
  const paymentMethods = deliveryOptions.data?.paymentMethods ?? [];
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
      points.filter((point) =>
        weekday !== undefined &&
        getPickupAvailability(point, weekday).availableToday
      ),
    [points, weekday],
  );
  const pointsRequiringDate = useMemo(
    () =>
      new Set(
        points
          .filter((point) =>
            weekday !== undefined &&
            !getPickupAvailability(point, weekday).availableToday
          )
          .map((point) => point.id),
      ),
    [points, weekday],
  );

  const form = useForm<CheckoutFormInput>({
    resolver: zodResolver(
      buildCheckoutFormSchema(
        points.length > 0,
        paymentMethods.length > 0,
        pointsRequiringDate,
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
    },
  });

  useEffect(() => {
    if (!deliveryOptions.data) return;
    if (
      deliveryOptions.data.methods[0] && !form.getValues("deliveryMethodType")
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
    if (paymentMethods[0] && !form.getValues("paymentMethod")) {
      form.setValue("paymentMethod", paymentMethods[0].method);
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
  const pickupPointId = form.watch("pickupPointId");
  const pickupDate = form.watch("pickupDate");
  const paymentMethod = form.watch("paymentMethod");

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
  const pickupDateBlocking = deliveryMethodType === "PICKUP" &&
    pickupPointId !== "" &&
    pointsRequiringDate.has(pickupPointId) &&
    (() => {
      if (!pickupDate) return true;
      const point = points.find((p) => p.id === pickupPointId);
      if (!point || weekday === undefined) return true;
      const availability = getPickupAvailability(point, weekday);
      if (availability.nextAvailableDay === null) return true;
      const selectedWeekday = new Date(`${pickupDate}T00:00:00Z`)
        .getUTCDay();
      return point.openDays.length > 0 &&
        !point.openDays.includes(selectedWeekday);
    })();

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await submitCheckout.mutateAsync({
      deliveryMethodType: values.deliveryMethodType,
      pickupPointId: values.deliveryMethodType === "PICKUP"
        ? values.pickupPointId
        : undefined,
      pickupDate: values.deliveryMethodType === "PICKUP" &&
          pointsRequiringDate.has(values.pickupPointId)
        ? values.pickupDate
        : undefined,
      paymentMethod: values.paymentMethod || undefined,
      customerName: values.customerName,
      customerPhone: values.customerPhone,
      customerEmail: values.customerEmail,
      items,
    });
    onOrderCreated({
      orderId: result.order.id,
      customerEmail: values.customerEmail,
    });
    if (result.whatsappUrl) {
      globalThis.location.href = result.whatsappUrl;
    }
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
                    })}
                  icon={m.type === "PICKUP"
                    ? <Store className="size-5" />
                    : <Truck className="size-5" />}
                  title={m.type === "PICKUP"
                    ? t("deliveryPickup")
                    : t("deliveryCourier")}
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
                      })}
                    title={point.label}
                    subtitle={availability.availableToday
                      ? t("availableToday")
                      : availability.nextAvailableDay !== null
                      ? t("nextAvailable", {
                        day: weekdays[availability.nextAvailableDay],
                      })
                      : t("pickupNoAvailability")}
                  />
                );
              })}
            </div>

            {pickupPointId && pointsRequiringDate.has(pickupPointId) &&
              (() => {
                const selectedPoint = points.find((p) =>
                  p.id === pickupPointId
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
                const invalidWeekday = selectedWeekday !== undefined &&
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
                    {invalidWeekday
                      ? (
                        <p className="text-sm text-red-500">
                          {t("pickupDateInvalidWeekday")}
                        </p>
                      )
                      : form.formState.errors.pickupDate && (
                        <p className="text-sm text-red-500">
                          {t("pickupDateRequired")}
                        </p>
                      )}
                  </div>
                );
              })()}
          </div>
        )}

        {deliveryMethodType === "COURIER" && (
          <div className="flex items-start gap-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-600">
            <Truck className="store-theme-active-text size-5 shrink-0" />
            <p>{t("courierNote")}</p>
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
                    })}
                  icon={PAYMENT_METHOD_ICONS[method.method]}
                  title={paymentLabels[method.method] ?? method.method}
                />
              ))}
            </div>
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
        disabled={submitCheckout.isPending ||
          !customerPhone ||
          !deliveryMethodType ||
          mixedCurrencies ||
          (deliveryMethodType === "PICKUP" && points.length > 0 &&
            !pickupPointId) ||
          pickupDateBlocking ||
          (paymentMethods.length > 0 && !paymentMethod)}
        className="store-theme-primary-button flex flex-col items-center gap-1 rounded-xl px-5 py-4 transition disabled:opacity-60"
      >
        <span className="flex items-center gap-2 text-sm font-semibold">
          <MessageCircle className="size-4" />
          {submitCheckout.isPending ? t("submitting") : t("submit")}
        </span>
        <span className="text-xs font-normal opacity-80">
          {t("submitSubtext")}
        </span>
      </button>
    </form>
  );
}
