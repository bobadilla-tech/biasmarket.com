"use client";

import { useEffect, useMemo, useRef } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { formatPhone, validatePhone } from "@biasmarket/utils/phone-country";
import {
  ASSISTED_PICKUP_DEPOSIT_PERCENT,
  assistedRequiredAmountCents,
} from "@biasmarket/utils/assisted-order-payment";
import { isPaymentMethodConfigured } from "@biasmarket/utils/payment-methods";
import type { CreateAssistedOrderResponseDto } from "@biasmarket/types";
import {
  buildAssistedOrderSchema,
  type AssistedOrderFormInput,
} from "@biasmarket/validation";
import { Button } from "@/components/ui/button";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select } from "@/components/ui/select";
import { ErrorState } from "@/components/shared/error-state";
import { FormErrorSummary, FormField } from "@/components/shared/form-a11y";
import { useDeliveryOptions } from "@/features/checkout/queries/use-delivery-options";
import {
  computeDeliveryCost,
  pickupDateBlocking,
  pointsRequiringDate as getPointsRequiringDate,
} from "@/features/checkout/lib/delivery-rules";
import {
  getPickupAvailability,
  nextDateForWeekday,
} from "@/features/checkout/lib/pickup-availability";
import { cn } from "@/lib/utils";
import { useBuyerLookup } from "../queries/use-buyer-lookup";
import {
  useOrderableProducts,
  useProductDetails,
} from "../queries/use-orderable-products";
import { useCreateAssistedOrder } from "../mutations/use-create-assisted-order";
import {
  buildAssistedOrderPayload,
  centsToAmount,
  hasMixedCurrencies,
  orderCurrency,
  subtotalCents,
  unitPriceCents,
  type PricedProduct,
} from "../lib/order-totals";
import { OrderItemRow } from "./order-item-row";

const controlClass =
  "min-h-11 rounded-xl border border-input bg-white text-base text-[#341b55] md:text-sm";
const inputClass = cn(controlClass, "w-full px-3");

function toDateInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function validatedNormalizedPhone(value: string): string {
  const result = validatePhone(value);
  return result.ok ? result.phone : "";
}

const EMPTY_ITEM = { productId: "", variantId: "", quantity: 1 };

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-4 rounded-3xl border border-[#f0e7f8] bg-white p-4 sm:p-5">
      <h2 className="text-base font-semibold text-[#2d1649]">{title}</h2>
      {children}
    </section>
  );
}

export function AssistedOrderForm({
  storeId,
  slug,
  onCreated,
}: {
  storeId: string;
  slug: string;
  onCreated: (result: CreateAssistedOrderResponseDto) => void;
}) {
  const t = useTranslations("dashboard.assistedOrder");
  const tCommon = useTranslations("common");
  const deliveryOptions = useDeliveryOptions(slug);
  const productsQuery = useOrderableProducts(storeId);
  const createOrder = useCreateAssistedOrder(storeId);

  const methods = deliveryOptions.data?.methods ?? [];
  const points = deliveryOptions.data?.points ?? [];
  const paymentMethods = deliveryOptions.data?.paymentMethods ?? [];
  const couriers = deliveryOptions.data?.couriers ?? [];
  const weekday = deliveryOptions.data?.weekday;

  const requiringDate = useMemo(
    () => getPointsRequiringDate(points, weekday),
    [points, weekday],
  );

  const form = useForm<AssistedOrderFormInput>({
    resolver: zodResolver(
      buildAssistedOrderSchema(
        points.length > 0,
        paymentMethods.length > 0,
        requiringDate,
      ),
    ),
    defaultValues: {
      customerPhone: "+51",
      customerName: "",
      items: [EMPTY_ITEM],
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
    },
  });
  const itemsArray = useFieldArray({ control: form.control, name: "items" });

  const customerPhone = form.watch("customerPhone");
  const items = form.watch("items");
  const deliveryMethodType = form.watch("deliveryMethodType");
  const pickupPointId = form.watch("pickupPointId");
  const pickupDate = form.watch("pickupDate");
  const courierName = form.watch("courierName");
  const courierModality = form.watch("courierModality");
  const paymentMethod = form.watch("paymentMethod");
  const paymentType = form.watch("paymentType");
  const errors = form.formState.errors;

  // Money -----------------------------------------------------------------
  const productDetails = useProductDetails(
    storeId,
    items.map((item) => item.productId),
  );
  const details = productDetails.details;
  const priced = useMemo(() => {
    const map = new Map<string, PricedProduct>();
    details.forEach((detail, id) => map.set(id, detail));
    return map;
  }, [details]);

  const itemsCents = subtotalCents(items, priced);
  const deliveryCents = Math.round(
    computeDeliveryCost({
      deliveryMethodType,
      courierName,
      courierModality,
      methods,
      couriers,
    }) * 100,
  );
  const totalCents = itemsCents + deliveryCents;
  const currency = orderCurrency(items, priced);
  const mixedCurrencies = hasMixedCurrencies(items, priced);
  const money = (cents: number) =>
    `${currency} ${centsToAmount(cents).toFixed(2)}`;

  const selectedPayment = paymentMethods.find(
    (m) => m.method === paymentMethod,
  );
  const partialAvailable =
    deliveryMethodType === "PICKUP" &&
    paymentMethod !== "CASH" &&
    selectedPayment != null;
  const depositPercent = ASSISTED_PICKUP_DEPOSIT_PERCENT;
  const partialRequiredCents = assistedRequiredAmountCents(
    totalCents,
    deliveryMethodType === "COURIER" ? "COURIER" : "PICKUP",
    "PARTIAL",
  );

  // Defaults, applied once the public delivery options load -----------------
  useEffect(() => {
    if (!deliveryOptions.data) return;
    if (methods[0] && !form.getValues("deliveryMethodType")) {
      form.setValue("deliveryMethodType", methods[0].type);
    }
    const current = form.getValues("pickupPointId");
    if (points.length === 0) {
      if (current) form.setValue("pickupPointId", "");
    } else if (!points.some((point) => point.id === current)) {
      const openToday = points.find(
        (point) =>
          weekday !== undefined &&
          getPickupAvailability(point, weekday).availableToday,
      );
      form.setValue("pickupPointId", openToday?.id ?? "");
    }
    // Prefer a configured electronic method over CASH, which is always "configured".
    const preferred =
      paymentMethods.find(
        (m) =>
          m.method !== "CASH" && isPaymentMethodConfigured(m.method, m.details),
      ) ?? paymentMethods[0];
    if (preferred && !form.getValues("paymentMethod")) {
      form.setValue("paymentMethod", preferred.method);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryOptions.data]);

  useEffect(() => {
    if (!partialAvailable && paymentType === "PARTIAL") {
      form.setValue("paymentType", "FULL");
    }
  }, [partialAvailable, paymentType, form]);

  // A date-requiring point starts on its next open day.
  useEffect(() => {
    if (!pickupPointId || !requiringDate.has(pickupPointId)) return;
    if (form.getValues("pickupDate")) return;
    const point = points.find((p) => p.id === pickupPointId);
    if (!point || weekday === undefined) return;
    const next = getPickupAvailability(point, weekday).nextAvailableDay;
    if (next === null) return;
    form.setValue(
      "pickupDate",
      toDateInputValue(nextDateForWeekday(next, new Date())),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickupPointId, requiringDate, points, weekday]);

  // A product with a single variant (the auto-created "Default" one) needs no choice.
  useEffect(() => {
    items.forEach((item, index) => {
      const variants = details.get(item.productId)?.variants ?? [];
      if (variants.length === 1 && !item.variantId) {
        form.setValue(`items.${index}.variantId`, variants[0]!.id);
      }
    });
  }, [items, details, form]);

  // Buyer lookup: hint + alias prefill (never over something the seller typed).
  const lookup = useBuyerLookup(storeId, customerPhone);
  const aliasEdited = useRef(false);
  const generatedAliasPhone = useRef<string | null>(null);
  const normalizedPhone = validatedNormalizedPhone(customerPhone);
  useEffect(() => {
    const lookupResult = lookup.data;
    if (
      normalizedPhone &&
      lookup.isSuccess &&
      lookupResult?.normalizedPhone === normalizedPhone &&
      lookupResult.lastAlias &&
      !aliasEdited.current &&
      !form.getValues("customerName")
    ) {
      form.setValue("customerName", lookupResult.lastAlias);
      generatedAliasPhone.current = normalizedPhone;
    }
  }, [lookup.data, lookup.isSuccess, normalizedPhone, form]);

  const validatedPhone = validatePhone(customerPhone);
  const dateBlocking = pickupDateBlocking({
    deliveryMethodType,
    pickupPointId,
    pickupDate,
    points,
    weekday,
    requiringDate,
  });
  const selectedPoint = points.find((p) => p.id === pickupPointId);
  const invalidWeekday =
    !!pickupDate &&
    !!selectedPoint &&
    requiringDate.has(pickupPointId) &&
    dateBlocking &&
    selectedPoint.openDays.length > 0;

  // Error copy ---------------------------------------------------------------
  const errorText = (message: string | undefined): string | undefined => {
    switch (message) {
      case undefined:
        return undefined;
      case "phone required":
        return t("errors.phoneRequired");
      case "phone invalid":
        return t("errors.phoneInvalid");
      case "alias too long":
        return t("errors.aliasTooLong");
      case "alias invalid":
        return t("errors.aliasInvalid");
      case "items required":
        return t("errors.itemsRequired");
      case "product required":
        return t("errors.productRequired");
      case "variant required":
        return t("errors.variantRequired");
      case "quantity required":
      case "quantity invalid":
        return t("errors.quantityInvalid");
      case "delivery method required":
        return t("errors.deliveryRequired");
      case "pickup point required":
        return t("errors.pickupPointRequired");
      case "pickup date required":
        return t("errors.pickupDateRequired");
      case "payment method required":
        return t("errors.paymentMethodRequired");
      case "courier name required":
        return t("errors.courierNameRequired");
      case "courier modality required":
        return t("errors.courierModalityRequired");
      case "shipping recipient name required":
        return t("errors.recipientRequired");
      case "shipping phone required":
        return t("errors.shippingPhoneRequired");
      case "shipping address required":
        return t("errors.addressRequired");
      case "shipping city required":
        return t("errors.cityRequired");
      case "agency name required":
        return t("errors.agencyRequired");
      default:
        return tCommon("formErrorsSummary");
    }
  };

  const submitError = mixedCurrencies
    ? t("errors.mixedCurrencies")
    : createOrder.error
      ? createOrder.error instanceof Error && createOrder.error.message
        ? createOrder.error.message
        : t("errors.generic")
      : undefined;
  const hasFieldErrors = Object.keys(errors).length > 0;
  const selectedProductDetailsReady = items.every((item) => {
    if (!item.productId) return true;
    const detail = details.get(item.productId);
    // Only loading/error blocks here. A missing variant choice is left to
    // onSubmit, which shows the field error instead of a silent disabled
    // button.
    return (
      !!detail &&
      productDetails.queryStates.get(item.productId)?.status === "success"
    );
  });
  const submitBlocked =
    createOrder.isPending ||
    totalCents <= 0 ||
    mixedCurrencies ||
    dateBlocking ||
    !deliveryOptions.isSuccess ||
    !selectedProductDetailsReady;

  const onSubmit = form.handleSubmit(async (values) => {
    // The server requires a variant whenever the product has any.
    let missingVariant = false;
    values.items.forEach((item, index) => {
      const variants = details.get(item.productId)?.variants ?? [];
      if (variants.length > 0 && !item.variantId) {
        missingVariant = true;
        form.setError(`items.${index}.variantId`, {
          message: "variant required",
        });
      }
    });
    if (missingVariant) return;

    try {
      const result = await createOrder.mutateAsync(
        buildAssistedOrderPayload(values, requiringDate),
      );
      onCreated(result);
    } catch {
      // Shown through `submitError` from the mutation state.
    }
  });

  const pickupPointMessage = errorText(errors.pickupPointId?.message);
  const itemsRootMessage = errorText(
    errors.items?.message ?? errors.items?.root?.message,
  );
  const lookupHint = lookup.data
    ? lookup.data.previousOrders > 0
      ? t("lookup.returning", { count: lookup.data.previousOrders })
      : t("lookup.first")
    : null;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-5">
      <FormErrorSummary
        id="assisted-order-error-summary"
        title={tCommon("formErrorsSummary")}
        messages={[
          hasFieldErrors ? tCommon("formErrorsSummary") : "",
          submitError ?? "",
        ].filter(Boolean)}
      />

      <Section title={t("phone.label")}>
        <FormField
          id="assisted-phone"
          label={t("phone.label")}
          error={errorText(errors.customerPhone?.message)}
          description={
            <>
              <span className="block">{t("phone.description")}</span>
              {validatedPhone.ok ? (
                <span
                  role="status"
                  className="mt-1 block font-semibold text-[#341b55]"
                >
                  {t("phone.review", {
                    phone: formatPhone(validatedPhone.phone),
                  })}
                </span>
              ) : null}
              {lookupHint ? (
                <span className="mt-1 block text-[#6b5a85]">{lookupHint}</span>
              ) : null}
            </>
          }
        >
          {(props) => (
            <Controller
              control={form.control}
              name="customerPhone"
              render={({ field }) => (
                <PhoneInput
                  {...props}
                  value={field.value}
                  onChange={(value) => {
                    const nextPhone = validatedNormalizedPhone(value);
                    if (
                      generatedAliasPhone.current &&
                      generatedAliasPhone.current !== nextPhone
                    ) {
                      form.setValue("customerName", "");
                      generatedAliasPhone.current = null;
                    }
                    field.onChange(value);
                  }}
                  countryLabel={t("phone.country")}
                  selectClassName={controlClass}
                  inputClassName={cn(controlClass, "px-3")}
                />
              )}
            />
          )}
        </FormField>

        <FormField
          id="assisted-alias"
          label={t("alias.label")}
          error={errorText(errors.customerName?.message)}
          description={t("alias.description")}
        >
          {(props) => (
            <input
              {...props}
              type="text"
              autoComplete="off"
              className={inputClass}
              {...form.register("customerName", {
                onChange: () => {
                  aliasEdited.current = true;
                  generatedAliasPhone.current = null;
                },
              })}
            />
          )}
        </FormField>
      </Section>

      <Section title={t("items.title")}>
        {productsQuery.isSuccess && productsQuery.products.length === 0 ? (
          <p role="status" className="text-sm text-[#b24368]">
            {t("items.noProducts")}
          </p>
        ) : null}
        {itemsRootMessage ? (
          <p role="alert" className="text-sm text-error-foreground">
            {itemsRootMessage}
          </p>
        ) : null}
        <ul className="flex flex-col gap-3">
          {itemsArray.fields.map((field, index) => {
            const value = items[index] ?? EMPTY_ITEM;
            const itemErrors = errors.items?.[index];
            const product = priced.get(value.productId);
            const detailQuery = productDetails.queryStates.get(value.productId);
            return (
              <OrderItemRow
                key={field.id}
                index={index}
                value={value}
                products={productsQuery.products}
                detail={details.get(value.productId)}
                detailLoading={detailQuery?.status === "pending"}
                detailError={detailQuery?.status === "error"}
                onRetryDetails={() => void detailQuery?.refetch()}
                errors={{
                  productId: errorText(itemErrors?.productId?.message),
                  variantId: errorText(itemErrors?.variantId?.message),
                  quantity: errorText(itemErrors?.quantity?.message),
                }}
                canRemove={itemsArray.fields.length > 1}
                lineTotal={
                  product && Number.isFinite(value.quantity)
                    ? money(
                        unitPriceCents(product, value.variantId) *
                          value.quantity,
                      )
                    : null
                }
                onChange={(next) => {
                  form.setValue(`items.${index}.productId`, next.productId, {
                    shouldDirty: true,
                  });
                  form.setValue(`items.${index}.variantId`, next.variantId, {
                    shouldDirty: true,
                  });
                  form.setValue(`items.${index}.quantity`, next.quantity, {
                    shouldDirty: true,
                  });
                }}
                onRemove={() => itemsArray.remove(index)}
              />
            );
          })}
        </ul>
        <Button
          type="button"
          variant="outline"
          onClick={() => itemsArray.append(EMPTY_ITEM)}
          className="min-h-11 self-start rounded-xl"
        >
          <Plus aria-hidden="true" className="size-4" />
          {t("items.add")}
        </Button>
      </Section>

      <Section title={t("delivery.title")}>
        {deliveryOptions.isPending ? (
          <p role="status" className="text-sm text-[#6b5a85]">
            {t("delivery.loading")}
          </p>
        ) : deliveryOptions.isError ? (
          <ErrorState
            message={t("delivery.loadFailed")}
            retry={() => void deliveryOptions.refetch()}
            retryLabel={t("delivery.retry")}
          />
        ) : deliveryOptions.isSuccess && methods.length === 0 ? (
          <p role="status" className="text-sm text-[#b24368]">
            {t("delivery.noMethods")}
          </p>
        ) : (
          <FormField
            id="assisted-delivery-method"
            label={t("delivery.method")}
            error={errorText(errors.deliveryMethodType?.message)}
          >
            {(props) => (
              <Select
                {...props}
                {...form.register("deliveryMethodType")}
                className="w-full"
                selectClassName={controlClass}
              >
                {methods.map((method) => (
                  <option key={method.type} value={method.type}>
                    {method.type === "PICKUP"
                      ? t("delivery.pickup")
                      : t("delivery.courier")}
                  </option>
                ))}
              </Select>
            )}
          </FormField>
        )}

        {deliveryMethodType === "PICKUP" && points.length > 0 ? (
          <>
            <FormField
              id="assisted-pickup-point"
              label={t("delivery.pickupPoint")}
              error={pickupPointMessage}
            >
              {(props) => (
                <Select
                  {...props}
                  {...form.register("pickupPointId", {
                    onChange: () => form.setValue("pickupDate", ""),
                  })}
                  className="w-full"
                  selectClassName={controlClass}
                >
                  <option value="">{t("delivery.selectPickupPoint")}</option>
                  {points.map((point) => (
                    <option key={point.id} value={point.id}>
                      {point.label}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            {requiringDate.has(pickupPointId) ? (
              <FormField
                id="assisted-pickup-date"
                label={t("delivery.pickupDate")}
                error={
                  invalidWeekday
                    ? t("delivery.pickupDateInvalidWeekday")
                    : errorText(errors.pickupDate?.message)
                }
              >
                {(props) => (
                  <input
                    {...props}
                    type="date"
                    min={toDateInputValue(new Date())}
                    className={inputClass}
                    {...form.register("pickupDate")}
                  />
                )}
              </FormField>
            ) : null}
          </>
        ) : null}

        {deliveryMethodType === "COURIER" ? (
          <>
            <FormField
              id="assisted-courier"
              label={t("delivery.courierName")}
              error={errorText(errors.courierName?.message)}
            >
              {(props) => (
                <Select
                  {...props}
                  {...form.register("courierName", {
                    onChange: () => form.setValue("courierModality", ""),
                  })}
                  className="w-full"
                  selectClassName={controlClass}
                >
                  <option value="">{t("delivery.selectCourier")}</option>
                  {couriers.map((courier) => (
                    <option key={courier.id} value={courier.name}>
                      {courier.name}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <FormField
              id="assisted-modality"
              label={t("delivery.courierModality")}
              error={errorText(errors.courierModality?.message)}
            >
              {(props) => (
                <Select
                  {...props}
                  {...form.register("courierModality")}
                  className="w-full"
                  selectClassName={controlClass}
                >
                  <option value="">{t("delivery.selectModality")}</option>
                  {(
                    couriers.find((c) => c.name === courierName)?.modalities ??
                    []
                  ).map((modality) => (
                    <option key={modality.modality} value={modality.modality}>
                      {modality.modality === "AGENCY"
                        ? t("delivery.AGENCY")
                        : t("delivery.HOME")}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            <FormField
              id="assisted-recipient"
              label={t("delivery.recipientName")}
              error={errorText(errors.shippingRecipientName?.message)}
            >
              {(props) => (
                <input
                  {...props}
                  type="text"
                  autoComplete="off"
                  className={inputClass}
                  {...form.register("shippingRecipientName")}
                />
              )}
            </FormField>
            <FormField
              id="assisted-recipient-phone"
              label={t("delivery.recipientPhone")}
              error={errorText(errors.shippingPhone?.message)}
            >
              {(props) => (
                <input
                  {...props}
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  className={inputClass}
                  {...form.register("shippingPhone")}
                />
              )}
            </FormField>
            {courierModality === "AGENCY" ? (
              <FormField
                id="assisted-agency"
                label={t("delivery.agencyName")}
                error={errorText(errors.shippingAgencyName?.message)}
              >
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    className={inputClass}
                    {...form.register("shippingAgencyName")}
                  />
                )}
              </FormField>
            ) : null}
            {courierModality === "HOME" ? (
              <>
                <FormField
                  id="assisted-line1"
                  label={t("delivery.line1")}
                  error={errorText(errors.shippingLine1?.message)}
                >
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      className={inputClass}
                      {...form.register("shippingLine1")}
                    />
                  )}
                </FormField>
                <FormField
                  id="assisted-city"
                  label={t("delivery.city")}
                  error={errorText(errors.shippingCity?.message)}
                >
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      className={inputClass}
                      {...form.register("shippingCity")}
                    />
                  )}
                </FormField>
                <FormField
                  id="assisted-district"
                  label={t("delivery.district")}
                >
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      className={inputClass}
                      {...form.register("shippingDistrict")}
                    />
                  )}
                </FormField>
                <FormField
                  id="assisted-reference"
                  label={t("delivery.reference")}
                >
                  {(props) => (
                    <input
                      {...props}
                      type="text"
                      className={inputClass}
                      {...form.register("shippingReference")}
                    />
                  )}
                </FormField>
              </>
            ) : null}
          </>
        ) : null}
      </Section>

      <Section title={t("payment.title")}>
        {deliveryOptions.isSuccess && paymentMethods.length === 0 ? (
          <p role="status" className="text-sm text-[#b24368]">
            {t("payment.noMethods")}
          </p>
        ) : (
          <>
            <FormField
              id="assisted-payment-method"
              label={t("payment.method")}
              error={errorText(errors.paymentMethod?.message)}
            >
              {(props) => (
                <Select
                  {...props}
                  {...form.register("paymentMethod")}
                  className="w-full"
                  selectClassName={controlClass}
                >
                  <option value="">{t("payment.selectMethod")}</option>
                  {paymentMethods.map((method) => (
                    <option key={method.method} value={method.method}>
                      {paymentLabel(t, method.method)}
                    </option>
                  ))}
                </Select>
              )}
            </FormField>
            {partialAvailable ? (
              <FormField id="assisted-payment-type" label={t("payment.type")}>
                {(props) => (
                  <Select
                    {...props}
                    {...form.register("paymentType")}
                    className="w-full"
                    selectClassName={controlClass}
                  >
                    <option value="FULL">{t("payment.full")}</option>
                    <option value="PARTIAL">
                      {t("payment.partial", { percent: depositPercent })}
                    </option>
                  </Select>
                )}
              </FormField>
            ) : null}
          </>
        )}
      </Section>

      <div className="sticky bottom-0 -mx-1 flex flex-col gap-3 rounded-3xl border border-[#f0e7f8] bg-white/95 p-4 shadow-lg backdrop-blur pb-[max(1rem,env(safe-area-inset-bottom))]">
        <dl className="flex flex-col gap-1 text-sm text-[#6b5a85]">
          <div className="flex justify-between">
            <dt>{t("summary.subtotal")}</dt>
            <dd>{money(itemsCents)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>{t("summary.delivery")}</dt>
            <dd>{money(deliveryCents)}</dd>
          </div>
          <div className="flex justify-between text-base font-semibold text-[#2d1649]">
            <dt>{t("summary.total")}</dt>
            <dd>{money(totalCents)}</dd>
          </div>
          {paymentType === "PARTIAL" && partialAvailable ? (
            <div className="flex justify-between">
              <dt>{t("summary.toPayNow")}</dt>
              <dd>{money(partialRequiredCents ?? totalCents)}</dd>
            </div>
          ) : null}
        </dl>
        {totalCents <= 0 && items.some((item) => item.productId) ? (
          <p role="status" className="text-sm text-[#b24368]">
            {t("summary.totalZero")}
          </p>
        ) : null}
        <Button
          type="submit"
          disabled={submitBlocked}
          className="store-theme-primary-button min-h-11 rounded-2xl text-sm font-semibold hover:opacity-100"
        >
          {createOrder.isPending ? t("submitting") : t("submit")}
        </Button>
      </div>
    </form>
  );
}

function paymentLabel(
  t: ReturnType<typeof useTranslations>,
  method: string,
): string {
  switch (method) {
    case "YAPE":
      return t("payment.labels.YAPE");
    case "PLIN":
      return t("payment.labels.PLIN");
    case "TRANSFER":
      return t("payment.labels.TRANSFER");
    default:
      return t("payment.labels.CASH");
  }
}
