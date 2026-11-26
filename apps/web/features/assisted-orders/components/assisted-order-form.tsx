"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Minus,
  Package,
  Plus,
  ShoppingCart,
  Truck,
  Upload,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { formatPhone, validatePhone } from "@biasmarket/utils/phone-country";
import {
  ASSISTED_PICKUP_DEPOSIT_PERCENT,
  assistedRequiredAmountCents,
} from "@biasmarket/utils/assisted-order-payment";
import { isPaymentMethodConfigured } from "@biasmarket/utils/payment-methods";
import type {
  CreateAssistedOrderResponseDto,
  ProductDetailResponseDto,
  ProductResponseDto,
} from "@biasmarket/types";
import {
  type AssistedOrderFormInput,
  buildAssistedOrderSchema,
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
import { useCollections } from "@/features/collections/queries/use-collections";
import { useRegisterPayment } from "@/features/orders/mutations/use-register-payment";
import { limaToday } from "@/lib/lima-date";
import { cn } from "@/lib/utils";
import { useBuyerLookup } from "../queries/use-buyer-lookup";
import {
  useOrderableProducts,
  useProductDetails,
} from "../queries/use-orderable-products";
import { IdempotentReplayError } from "../api/assisted-orders.api";
import { useCreateAssistedOrder } from "../mutations/use-create-assisted-order";
import {
  filterOrderCatalog,
  ORDER_CATALOG_PAGE_SIZE,
  visibleCatalogPage,
} from "../lib/create-order-catalog";
import {
  extraCourierErrors,
  parsePaidAmountCents,
  proofFieldErrors,
} from "../lib/create-order-payment";
import {
  canContinueFromSummary,
  nextCreateOrderStep,
  previousCreateOrderStep,
  type CreateOrderStep,
} from "../lib/create-order-steps";
import {
  buildAssistedOrderPayload,
  formatOrderMoney,
  hasMixedCurrencies,
  orderCurrency,
  type PricedProduct,
  subtotalCents,
  unitPriceCents,
} from "../lib/order-totals";

const controlClass =
  "min-h-11 rounded-xl border border-input bg-white text-base text-[#341b55] md:text-sm";
const inputClass = cn(controlClass, "w-full px-3");
const EMPTY_ARRAY: never[] = [];
const PAYMENT_ORDER = ["YAPE", "PLIN", "TRANSFER", "CASH"] as const;

function toDateInputValue(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function validatedNormalizedPhone(value: string): string {
  const result = validatePhone(value);
  return result.ok ? result.phone : "";
}

function availableUnits(
  variant: ProductDetailResponseDto["variants"][number] | undefined,
): number | null {
  if (!variant || variant.stock === null) return null;
  return Math.max(0, variant.stock - variant.reserved);
}

function useCreateOrderMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 767px)");
    const apply = () => setIsMobile(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);
  return isMobile;
}

function Card({
  icon,
  title,
  subtitle,
  aside,
  children,
}: {
  icon: ReactNode;
  title: string;
  subtitle?: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-4 rounded-3xl border border-[#f0e7f8] bg-white p-4 sm:p-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-[#f7f0ff] text-[#5a3d82]">
            {icon}
          </span>
          <div>
            <h2 className="text-base font-semibold text-[#2d1649]">{title}</h2>
            {subtitle ? (
              <p className="text-sm text-[#8e7ca7]">{subtitle}</p>
            ) : null}
          </div>
        </div>
        {aside}
      </div>
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
  const isMobile = useCreateOrderMobile();
  const [step, setStep] = useState<CreateOrderStep>("products");
  const [search, setSearch] = useState("");
  const [collectionId, setCollectionId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(ORDER_CATALOG_PAGE_SIZE);
  const [amountPaid, setAmountPaid] = useState("0.00");
  const [receipt, setReceipt] = useState<File | null>(null);
  const [amountError, setAmountError] = useState<string | undefined>();
  const [receiptError, setReceiptError] = useState<string | undefined>();
  const [paymentSaveError, setPaymentSaveError] = useState<string | undefined>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const deliveryOptions = useDeliveryOptions(slug);
  const productsQuery = useOrderableProducts(storeId);
  const collectionsQuery = useCollections(storeId);
  const createOrder = useCreateAssistedOrder(storeId);
  const registerPayment = useRegisterPayment(storeId);
  const locale = useLocale();
  const idempotencyKey = useRef<string | null>(null);
  const createdResult = useRef<CreateAssistedOrderResponseDto | null>(null);

  const methods = deliveryOptions.data?.methods ?? EMPTY_ARRAY;
  const points = deliveryOptions.data?.points ?? EMPTY_ARRAY;
  const paymentMethods = deliveryOptions.data?.paymentMethods ?? EMPTY_ARRAY;
  const couriers = deliveryOptions.data?.couriers ?? EMPTY_ARRAY;
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
      items: [],
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

  useEffect(() => {
    const subscription = form.watch(() => {
      if (!createdResult.current) idempotencyKey.current = null;
    });
    return () => subscription.unsubscribe();
  }, [form]);

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
  const money = (cents: number) => formatOrderMoney(currency, cents);

  const orderedPaymentMethods = useMemo(() => {
    return [...paymentMethods].sort(
      (a, b) =>
        PAYMENT_ORDER.indexOf(a.method as (typeof PAYMENT_ORDER)[number]) -
        PAYMENT_ORDER.indexOf(b.method as (typeof PAYMENT_ORDER)[number]),
    );
  }, [paymentMethods]);

  const selectedPayment = paymentMethods.find(
    (method) => method.method === paymentMethod,
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
    const preferred =
      paymentMethods.find(
        (method) =>
          method.method !== "CASH" &&
          isPaymentMethodConfigured(method.method, method.details),
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

  useEffect(() => {
    items.forEach((item, index) => {
      const variants = details.get(item.productId)?.variants ?? [];
      if (variants.length === 1 && !item.variantId) {
        form.setValue(`items.${index}.variantId`, variants[0]!.id);
      }
      const variant =
        variants.find((entry) => entry.id === item.variantId) ??
        (variants.length === 1 ? variants[0] : undefined);
      const available = availableUnits(variant);
      if (available !== null && item.quantity > available && available >= 1) {
        form.setValue(`items.${index}.quantity`, available);
      }
    });
  }, [items, details, form]);

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
      case "surnames required":
        return t("errors.surnamesRequired");
      case "document type required":
        return t("errors.documentTypeRequired");
      case "document number required":
        return t("errors.documentNumberRequired");
      case "department required":
        return t("errors.departmentRequired");
      case "province required":
        return t("errors.provinceRequired");
      case "district required":
        return t("errors.districtRequired");
      case "amountInvalid":
        return t("errors.amountInvalid");
      case "amountRequired":
        return t("errors.amountRequired");
      case "amountTooHigh":
        return t("errors.amountTooHigh");
      case "fileRequired":
        return t("errors.fileRequired");
      case "fileTooLarge":
        return t("errors.fileTooLarge");
      case "fileType":
        return t("errors.fileType");
      default:
        return tCommon("formErrorsSummary");
    }
  };

  const productCollections = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const collection of collectionsQuery.data ?? []) {
      for (const entry of collection.products) {
        const set = map.get(entry.productId) ?? new Set<string>();
        set.add(collection.id);
        map.set(entry.productId, set);
      }
    }
    return map;
  }, [collectionsQuery.data]);

  const filteredProducts = useMemo(
    () =>
      filterOrderCatalog(productsQuery.products, {
        query: search,
        collectionId,
        productCollections,
      }),
    [productsQuery.products, search, collectionId, productCollections],
  );
  const visibleProducts = visibleCatalogPage(filteredProducts, visibleCount);

  useEffect(() => {
    setVisibleCount(ORDER_CATALOG_PAGE_SIZE);
  }, [search, collectionId]);

  const productCount = items.reduce(
    (sum, item) => sum + (item.productId ? item.quantity : 0),
    0,
  );
  const lineCount = items.filter((item) => item.productId).length;
  const canContinue = canContinueFromSummary(lineCount);

  const maxQuantityFor = (productId: string, variantId: string) => {
    const variants = details.get(productId)?.variants ?? [];
    const variant =
      variants.find((entry) => entry.id === variantId) ??
      (variants.length === 1 ? variants[0] : undefined);
    const available = availableUnits(variant);
    return available ?? Number.POSITIVE_INFINITY;
  };

  const changeQty = (index: number, delta: number) => {
    const item = form.getValues(`items.${index}`);
    if (!item) return;
    const next = item.quantity + delta;
    if (next <= 0) {
      itemsArray.remove(index);
      return;
    }
    const max = maxQuantityFor(item.productId, item.variantId);
    form.setValue(`items.${index}.quantity`, Math.min(next, max), {
      shouldDirty: true,
    });
  };

  const addProduct = (productId: string) => {
    const current = form.getValues("items");
    const existing = current.findIndex((item) => item.productId === productId);
    if (existing >= 0) {
      changeQty(existing, 1);
      return;
    }
    itemsArray.append({ productId, variantId: "", quantity: 1 });
  };

  const replayOrderId =
    createOrder.error instanceof IdempotentReplayError
      ? createOrder.error.orderId
      : null;
  const submitError = mixedCurrencies
    ? t("errors.mixedCurrencies")
    : paymentSaveError
      ? paymentSaveError
      : replayOrderId
        ? t("errors.alreadyCreated")
        : createOrder.error
          ? createOrder.error instanceof Error && createOrder.error.message
            ? createOrder.error.message
            : t("errors.generic")
          : undefined;
  const hasFieldErrors = Object.keys(errors).length > 0;
  const selectedProductDetailsReady = items.every((item) => {
    if (!item.productId) return true;
    const detail = details.get(item.productId);
    return (
      !!detail &&
      productDetails.queryStates.get(item.productId)?.status === "success"
    );
  });
  const hasPricedItems = items.some((item) => item.productId);
  const submitBlocked =
    createOrder.isPending ||
    registerPayment.isPending ||
    (hasPricedItems && totalCents <= 0) ||
    mixedCurrencies ||
    dateBlocking ||
    !deliveryOptions.isSuccess ||
    !selectedProductDetailsReady;

  const forgetDraftKey = () => {
    if (!createdResult.current) idempotencyKey.current = null;
  };

  const onSubmit = form.handleSubmit(async (values) => {
    const proof = proofFieldErrors({
      amount: amountPaid,
      method: values.paymentMethod,
      file: receipt,
      maxCents: Math.max(totalCents, 0),
      today: limaToday(),
    });
    setAmountError(errorText(proof.amount));
    setReceiptError(errorText(proof.file));
    if (proof.amount || proof.file) {
      if (isMobile) setStep("details");
      return;
    }

    let missingCourier = false;
    for (const [field, message] of Object.entries(extraCourierErrors(values))) {
      missingCourier = true;
      form.setError(field as keyof AssistedOrderFormInput, { message });
    }
    if (missingCourier) {
      if (isMobile) setStep("details");
      return;
    }

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
    if (missingVariant) {
      if (isMobile) setStep("summary");
      return;
    }

    try {
      if (!createdResult.current) {
        idempotencyKey.current ??= crypto.randomUUID();
        const result = await createOrder.mutateAsync({
          payload: buildAssistedOrderPayload(values, requiringDate),
          idempotencyKey: idempotencyKey.current,
        });
        idempotencyKey.current = null;
        createdResult.current = result;
      }
      const paidCents = parsePaidAmountCents(amountPaid);
      if (typeof paidCents === "number" && paidCents > 0) {
        await registerPayment.mutateAsync({
          orderId: createdResult.current.order.id,
          values: {
            amount: amountPaid.trim(),
            method: values.paymentMethod as
              | "YAPE"
              | "PLIN"
              | "TRANSFER"
              | "CASH",
            operationCode: "",
            paidAt: limaToday(),
            note: "",
            file: receipt,
          },
        });
      }
      const result = createdResult.current;
      createdResult.current = null;
      setPaymentSaveError(undefined);
      onCreated(result);
    } catch (error) {
      if (createdResult.current) {
        const message =
          error instanceof Error && error.message
            ? error.message
            : t("errors.generic");
        setPaymentSaveError(t("errors.paymentSaveFailed", { message }));
      }
    }
  });

  const lookupHint = lookup.data
    ? lookup.data.previousOrders > 0
      ? t("lookup.returning", { count: lookup.data.previousOrders })
      : t("lookup.first")
    : null;

  const phoneField = (
    <FormField
      id="assisted-phone"
      label={t("phone.label")}
      error={errorText(errors.customerPhone?.message)}
      description={
        <>
          {validatedPhone.ok ? (
            <span
              role="status"
              className="block font-semibold text-[#341b55]"
            >
              {t("phone.review", { phone: formatPhone(validatedPhone.phone) })}
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
              label={t("phone.label")}
              placeholder={t("phone.placeholder")}
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
  );

  const nameField = (
    <FormField
      id="assisted-alias"
      label={t("alias.label")}
      error={errorText(errors.customerName?.message)}
    >
      {(props) => (
        <input
          {...props}
          type="text"
          autoComplete="off"
          placeholder={t("alias.placeholder")}
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
  );

  const buyer = (
    <Card
      icon={<UserRound aria-hidden="true" className="size-5" />}
      title={t("buyer.title")}
      subtitle={t("buyer.subtitle")}
    >
      {isMobile ? (
        <>
          {nameField}
          {phoneField}
        </>
      ) : (
        <>
          {phoneField}
          {nameField}
        </>
      )}
    </Card>
  );

  const catalog = (
    <Card
      icon={<Package aria-hidden="true" className="size-5" />}
      title={t("items.title")}
      subtitle={t("items.subtitle")}
    >
      <div className="flex flex-col gap-3">
        <label className="sr-only" htmlFor="assisted-product-search">
          {t("items.search")}
        </label>
        <input
          id="assisted-product-search"
          type="search"
          value={search}
          placeholder={t("items.search")}
          onChange={(event) => setSearch(event.target.value)}
          className={inputClass}
        />
        <div
          className="flex gap-2 overflow-x-auto pb-1"
          role="group"
          aria-label={t("items.all")}
        >
          <button
            type="button"
            aria-pressed={collectionId === null}
            onClick={() => setCollectionId(null)}
            className={cn(
              "min-h-11 shrink-0 rounded-full px-4 text-sm font-medium",
              collectionId === null
                ? "bg-[#341b55] text-white"
                : "bg-[#f7f0ff] text-[#341b55]",
            )}
          >
            {t("items.all")}
          </button>
          {(collectionsQuery.data ?? []).map((collection) => (
            <button
              key={collection.id}
              type="button"
              aria-pressed={collectionId === collection.id}
              onClick={() => setCollectionId(collection.id)}
              className={cn(
                "min-h-11 shrink-0 rounded-full px-4 text-sm font-medium",
                collectionId === collection.id
                  ? "bg-[#341b55] text-white"
                  : "bg-[#f7f0ff] text-[#341b55]",
              )}
            >
              {collection.name}
            </button>
          ))}
        </div>
      </div>
      {productsQuery.isSuccess && productsQuery.products.length === 0 ? (
        <p role="status" className="text-sm text-[#b24368]">
          {t("items.noProducts")}
        </p>
      ) : null}
      {filteredProducts.length === 0 && productsQuery.products.length > 0 ? (
        <p role="status" className="text-sm text-[#6b5a85]">
          {t("items.emptyCatalog")}
        </p>
      ) : null}
      <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {visibleProducts.map((product) => (
          <li
            key={product.id}
            className="flex gap-3 rounded-2xl border border-[#f0e7f8] bg-[#fcf9ff] p-2 lg:flex-col"
          >
            <ProductImage product={product} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="truncate text-sm font-semibold text-[#2d1649]">
                {product.name}
              </p>
              <p className="text-sm text-[#5a3d82]">
                {formatOrderMoney(
                  product.currency,
                  Math.round(Number(product.price) * 100),
                )}
              </p>
              <button
                type="button"
                aria-label={`${t("items.addShort")} ${product.name}`}
                disabled={product.soldOut}
                onClick={() => addProduct(product.id)}
                className="mt-auto inline-flex min-h-11 items-center justify-center gap-1 rounded-xl bg-white px-2 text-sm font-semibold text-[#341b55] ring-1 ring-[#eadff5] disabled:opacity-40"
              >
                <Plus aria-hidden="true" className="size-4" />
                {t("items.addShort")}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {visibleProducts.length < filteredProducts.length ? (
        <Button
          type="button"
          variant="outline"
          onClick={() =>
            setVisibleCount((count) => count + ORDER_CATALOG_PAGE_SIZE)
          }
          className="min-h-11 self-start rounded-xl"
        >
          {t("items.loadMore")}
        </Button>
      ) : null}
    </Card>
  );

  const summary = (
    <Card
      icon={<ShoppingCart aria-hidden="true" className="size-5" />}
      title={t("summary.title")}
      aside={
        <span className="rounded-full bg-[#f7f0ff] px-3 py-1 text-xs font-semibold text-[#5a3d82]">
          {t("summary.count", { count: productCount })}
        </span>
      }
    >
      {itemsRootMessage(errorText, errors) ? (
        <p role="alert" className="text-sm text-error-foreground">
          {itemsRootMessage(errorText, errors)}
        </p>
      ) : null}
      {lineCount === 0 ? (
        <p role="status" className="text-sm text-[#8e7ca7]">
          {t("summary.empty")}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {itemsArray.fields.map((field, index) => {
            const value = items[index];
            if (!value?.productId) return null;
            const product = productsQuery.products.find(
              (entry) => entry.id === value.productId,
            );
            const detail = details.get(value.productId);
            const detailQuery = productDetails.queryStates.get(value.productId);
            const variants = detail?.variants ?? [];
            const selectedVariant = variants.find(
              (variant) => variant.id === value.variantId,
            );
            const available = availableUnits(
              selectedVariant ??
                (variants.length === 1 ? variants[0] : undefined),
            );
            const unit = priced.get(value.productId);
            return (
              <li key={field.id} className="flex gap-3">
                {product ? <ProductImage product={product} /> : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#2d1649]">
                    {product?.name}
                  </p>
                  {unit ? (
                    <p className="text-sm text-[#5a3d82]">
                      {money(unitPriceCents(unit, value.variantId))}
                    </p>
                  ) : null}
                  {detailQuery?.status === "pending" ? (
                    <p role="status" className="text-sm text-[#6b5a85]">
                      {t("items.detailsLoading")}
                    </p>
                  ) : null}
                  {detailQuery?.status === "error" ? (
                    <div role="alert" className="text-sm text-error-foreground">
                      <p>{t("items.detailsFailed")}</p>
                      <button
                        type="button"
                        onClick={() => void detailQuery.refetch()}
                        className="min-h-11 underline"
                      >
                        {t("items.retry")}
                      </button>
                    </div>
                  ) : null}
                  {variants.length > 1 ? (
                    <FormField
                      id={`assisted-item-${index}-variant`}
                      label={t("items.variant")}
                      error={errorText(errors.items?.[index]?.variantId?.message)}
                    >
                      {(props) => (
                        <Select
                          {...props}
                          value={value.variantId}
                          onChange={(event) => {
                            form.setValue(
                              `items.${index}.variantId`,
                              event.target.value,
                              { shouldDirty: true },
                            );
                            form.setValue(`items.${index}.quantity`, 1, {
                              shouldDirty: true,
                            });
                          }}
                          className="mt-2 w-full"
                          selectClassName={controlClass}
                        >
                          <option value="">{t("items.selectVariant")}</option>
                          {variants.map((variant) => (
                            <option
                              key={variant.id}
                              value={variant.id}
                              disabled={availableUnits(variant) === 0}
                            >
                              {variant.name}
                            </option>
                          ))}
                        </Select>
                      )}
                    </FormField>
                  ) : null}
                  {available !== null ? (
                    <p className="text-xs text-[#8e7ca7]">
                      {t("items.stockLeft", { count: available })}
                    </p>
                  ) : null}
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={t("items.decrease")}
                      onClick={() => changeQty(index, -1)}
                      className={cn(
                        controlClass,
                        "inline-flex w-11 items-center justify-center",
                      )}
                    >
                      <Minus aria-hidden="true" className="size-4" />
                    </button>
                    <span
                      aria-label={t("items.quantity")}
                      className="min-w-6 text-center text-sm font-semibold text-[#2d1649]"
                    >
                      {value.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label={t("items.increase")}
                      onClick={() => changeQty(index, 1)}
                      className={cn(
                        controlClass,
                        "inline-flex w-11 items-center justify-center",
                      )}
                    >
                      <Plus aria-hidden="true" className="size-4" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <dl className="flex flex-col gap-1 border-t border-[#f0e7f8] pt-3 text-sm text-[#6b5a85]">
        <div className="flex justify-between">
          <dt>{t("summary.subtotal")}</dt>
          <dd>{money(itemsCents)}</dd>
        </div>
        <div className="flex justify-between">
          <dt>{t("summary.delivery")}</dt>
          <dd>{money(deliveryCents)}</dd>
        </div>
        <div className="flex justify-between rounded-xl bg-[#f7f0ff] px-3 py-2 text-base font-semibold text-[#2d1649]">
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
      {totalCents <= 0 && hasPricedItems ? (
        <p role="status" className="text-sm text-[#b24368]">
          {t("summary.totalZero")}
        </p>
      ) : null}
    </Card>
  );

  const delivery = (
    <Card
      icon={<Truck aria-hidden="true" className="size-5" />}
      title={t("delivery.title")}
    >
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
        <div
          role="radiogroup"
          aria-label={t("delivery.method")}
          className="grid gap-2"
        >
          {errorText(errors.deliveryMethodType?.message) ? (
            <p role="alert" className="text-sm text-error-foreground">
              {errorText(errors.deliveryMethodType?.message)}
            </p>
          ) : null}
          {methods.map((method) => {
            const selected = deliveryMethodType === method.type;
            const label =
              method.type === "PICKUP"
                ? t("delivery.pickupCard")
                : t("delivery.courierCard");
            const inputId = `assisted-delivery-${method.type}`;
            return (
              <div
                key={method.type}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-2xl border px-3 py-3 text-sm font-medium text-[#2d1649]",
                  selected
                    ? "border-[#341b55] bg-[#f7f0ff]"
                    : "border-[#eadff5] bg-white",
                )}
              >
                <input
                  id={inputId}
                  type="radio"
                  value={method.type}
                  className="size-4"
                  {...form.register("deliveryMethodType")}
                />
                <label htmlFor={inputId} className="cursor-pointer">
                  {label}
                </label>
              </div>
            );
          })}
        </div>
      )}

      {deliveryMethodType === "PICKUP" && points.length > 0 ? (
        <>
          <FormField
            id="assisted-pickup-point"
            label={t("delivery.pickupPoint")}
            error={errorText(errors.pickupPointId?.message)}
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
          <div
            role="radiogroup"
            aria-label={t("delivery.courierModality")}
            className="grid gap-2"
          >
            {errorText(errors.courierModality?.message) ? (
              <p role="alert" className="text-sm text-error-foreground">
                {errorText(errors.courierModality?.message)}
              </p>
            ) : null}
            {(
              couriers.find((courier) => courier.name === courierName)
                ?.modalities ?? []
            ).map((modality) => {
              const inputId = `assisted-modality-${modality.modality}`;
              return (
                <div
                  key={modality.modality}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-2xl border px-3 py-3 text-sm font-medium",
                    courierModality === modality.modality
                      ? "border-[#341b55] bg-[#f7f0ff]"
                      : "border-[#eadff5]",
                  )}
                >
                  <input
                    id={inputId}
                    type="radio"
                    value={modality.modality}
                    className="size-4"
                    {...form.register("courierModality")}
                  />
                  <label htmlFor={inputId} className="cursor-pointer">
                    {modality.modality === "AGENCY"
                      ? t("delivery.AGENCY")
                      : t("delivery.HOME")}
                  </label>
                </div>
              );
            })}
          </div>
          {courierModality ? (
            <div className="flex flex-col gap-3">
              <h3 className="text-sm font-semibold text-[#2d1649]">
                {t("delivery.addressTitle")}
              </h3>
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
                id="assisted-surnames"
                label={t("delivery.recipientSurnames")}
                error={errorText(errors.shippingRecipientSurnames?.message)}
              >
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    autoComplete="off"
                    className={inputClass}
                    {...form.register("shippingRecipientSurnames")}
                  />
                )}
              </FormField>
              <FormField
                id="assisted-document-type"
                label={t("delivery.documentType")}
                error={errorText(errors.shippingDocumentType?.message)}
              >
                {(props) => (
                  <Select
                    {...props}
                    {...form.register("shippingDocumentType")}
                    className="w-full"
                    selectClassName={controlClass}
                  >
                    <option value="">{t("delivery.selectDocumentType")}</option>
                    <option value="DNI">DNI</option>
                    <option value="CE">CE</option>
                    <option value="RUC">RUC</option>
                    <option value="PASSPORT">Pasaporte</option>
                  </Select>
                )}
              </FormField>
              <FormField
                id="assisted-document-number"
                label={t("delivery.documentNumber")}
                error={errorText(errors.shippingDocumentNumber?.message)}
              >
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    className={inputClass}
                    {...form.register("shippingDocumentNumber")}
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
              <FormField
                id="assisted-department"
                label={t("delivery.department")}
                error={errorText(errors.shippingDepartment?.message)}
              >
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    className={inputClass}
                    {...form.register("shippingDepartment")}
                  />
                )}
              </FormField>
              <FormField
                id="assisted-province"
                label={t("delivery.province")}
                error={errorText(errors.shippingProvince?.message)}
              >
                {(props) => (
                  <input
                    {...props}
                    type="text"
                    className={inputClass}
                    {...form.register("shippingProvince")}
                  />
                )}
              </FormField>
              <FormField
                id="assisted-district"
                label={t("delivery.district")}
                error={errorText(errors.shippingDistrict?.message)}
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
            </div>
          ) : null}
        </>
      ) : null}
    </Card>
  );

  const payment = (
    <Card
      icon={<Wallet aria-hidden="true" className="size-5" />}
      title={t("payment.title")}
    >
      {deliveryOptions.isSuccess && paymentMethods.length === 0 ? (
        <p role="status" className="text-sm text-[#b24368]">
          {t("payment.noMethods")}
        </p>
      ) : (
        <>
          <div
            role="radiogroup"
            aria-label={t("payment.method")}
            className="grid grid-cols-3 gap-2"
          >
            {errorText(errors.paymentMethod?.message) ? (
              <p role="alert" className="col-span-3 text-sm text-error-foreground">
                {errorText(errors.paymentMethod?.message)}
              </p>
            ) : null}
            {orderedPaymentMethods.map((method) => {
              const selected = paymentMethod === method.method;
              const inputId = `assisted-payment-${method.method}`;
              return (
                <div
                  key={method.method}
                  className={cn(
                    "flex min-h-11 flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-3 text-center text-sm font-semibold text-[#2d1649]",
                    selected
                      ? "border-[#341b55] bg-[#f7f0ff]"
                      : "border-[#eadff5] bg-white",
                  )}
                >
                  <input
                    id={inputId}
                    type="radio"
                    value={method.method}
                    className="sr-only"
                    {...form.register("paymentMethod")}
                  />
                  <label
                    htmlFor={inputId}
                    className="flex cursor-pointer flex-col items-center gap-1"
                  >
                    <PaymentMark method={method.method} />
                    {paymentLabel(t, method.method)}
                  </label>
                </div>
              );
            })}
          </div>
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
          <FormField
            id="assisted-amount"
            label={t("payment.amount")}
            error={amountError}
          >
            {(props) => (
              <input
                {...props}
                inputMode="decimal"
                value={amountPaid}
                onChange={(event) => {
                  setAmountPaid(event.target.value);
                  setAmountError(undefined);
                  setPaymentSaveError(undefined);
                  forgetDraftKey();
                }}
                className={inputClass}
              />
            )}
          </FormField>
          <div className="flex flex-col gap-2">
            <input
              ref={fileInputRef}
              id="assisted-receipt"
              type="file"
              accept="image/jpeg,image/png"
              aria-label={t("payment.upload")}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                setReceipt(file);
                setReceiptError(undefined);
                setPaymentSaveError(undefined);
                forgetDraftKey();
              }}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileInputRef.current?.click()}
              className="min-h-11 self-start rounded-xl"
            >
              <Upload aria-hidden="true" className="size-4" />
              {t("payment.upload")}
            </Button>
            {receipt ? (
              <p className="flex items-center gap-2 text-sm text-[#341b55]">
                <span>{receipt.name}</span>
                <button
                  type="button"
                  aria-label={t("payment.removeFile")}
                  onClick={() => {
                    setReceipt(null);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }}
                  className="inline-flex size-11 items-center justify-center"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </p>
            ) : null}
            {receiptError ? (
              <p role="alert" className="text-sm text-error-foreground">
                {receiptError}
              </p>
            ) : null}
          </div>
        </>
      )}
    </Card>
  );

  const submitButton = (
    <Button
      type="submit"
      disabled={submitBlocked}
      className="store-theme-primary-button min-h-11 w-full rounded-2xl text-sm font-semibold hover:opacity-100"
    >
      {createOrder.isPending || registerPayment.isPending
        ? t("submitting")
        : `${t("submit")} →`}
    </Button>
  );

  const go = (direction: "next" | "back") => {
    setStep((current) =>
      direction === "next"
        ? (nextCreateOrderStep(current) ?? current)
        : (previousCreateOrderStep(current) ?? current),
    );
  };

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
      {replayOrderId && slug ? (
        <Link
          href={`/${locale}/dashboard/${slug}/orders?order=${encodeURIComponent(
            replayOrderId,
          )}`}
          className="-mt-3 text-sm font-semibold text-[#341b55] underline underline-offset-2"
        >
          {t("errors.viewExistingOrder")}
        </Link>
      ) : null}

      {isMobile ? (
        <>
          {step === "products" ? (
            <>
              {catalog}
              <Button
                type="button"
                disabled={!canContinue}
                onClick={() => go("next")}
                className="min-h-11 rounded-2xl"
              >
                {t("steps.viewSummary")}
              </Button>
            </>
          ) : null}
          {step === "summary" ? (
            <>
              <StepBack onClick={() => go("back")} label={t("steps.back")} />
              {summary}
              <Button
                type="button"
                disabled={!canContinue}
                onClick={() => go("next")}
                className="min-h-11 rounded-2xl"
              >
                {t("steps.continue")} →
              </Button>
            </>
          ) : null}
          {step === "details" ? (
            <div className="flex flex-col gap-5 pb-28">
              <StepBack onClick={() => go("back")} label={t("steps.back")} />
              {buyer}
              {delivery}
              {payment}
              <div className="fixed inset-x-0 bottom-0 z-20 border-t border-[#f0e7f8] bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                {submitButton}
              </div>
            </div>
          ) : null}
        </>
      ) : (
        <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
          <div className="flex flex-col gap-5">
            {buyer}
            {catalog}
          </div>
          <div className="flex flex-col gap-5 lg:sticky lg:top-4">
            {summary}
            {delivery}
            {payment}
            {submitButton}
          </div>
        </div>
      )}
    </form>
  );
}

function StepBack({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-11 items-center self-start text-sm font-medium text-[#8e7ca7]"
    >
      ← {label}
    </button>
  );
}

function ProductImage({ product }: { product: ProductResponseDto }) {
  const src = product.images?.[0];
  if (!src) {
    return (
      <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-[#f0e7f8] text-xs text-[#8e7ca7] lg:aspect-square lg:h-auto lg:w-full">
        {product.name.slice(0, 1)}
      </span>
    );
  }
  return (
    <img
      src={src}
      alt=""
      className="size-16 shrink-0 rounded-xl object-cover lg:aspect-square lg:h-auto lg:w-full"
    />
  );
}

function PaymentMark({ method }: { method: string }) {
  const letter =
    method === "YAPE" ? "Y" : method === "PLIN" ? "P" : method === "TRANSFER" ? "T" : "E";
  return (
    <span
      aria-hidden="true"
      className="flex size-8 items-center justify-center rounded-full bg-[#efe4fb] text-xs font-bold text-[#341b55]"
    >
      {letter}
    </span>
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

function itemsRootMessage(
  errorText: (message: string | undefined) => string | undefined,
  errors: { items?: { message?: string; root?: { message?: string } } },
) {
  return errorText(errors.items?.message ?? errors.items?.root?.message);
}
