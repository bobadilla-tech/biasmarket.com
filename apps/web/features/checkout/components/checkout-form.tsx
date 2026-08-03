"use client";

import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select } from "@/components/ui/select";
import { type CartItem, hasMixedCurrencies } from "@/lib/cart";
import { useDeliveryOptions } from "../queries/use-delivery-options";
import { useSubmitCheckout } from "../mutations/use-submit-checkout";
import {
  buildCheckoutFormSchema,
  type CheckoutFormInput,
} from "../schemas/checkout.schema";

const inputClassName =
  "store-theme-input rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none";
const selectClassName =
  "rounded-xl border border-gray-200 py-2.5 text-sm text-gray-600";

interface CheckoutFormProps {
  slug: string;
  items: CartItem[];
  onOrderCreated: (result: { orderId: string; customerEmail: string }) => void;
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

  const [paymentMethodId, setPaymentMethodId] = useState("");
  useEffect(() => {
    if (paymentMethods[0] && !paymentMethodId) {
      setPaymentMethodId(paymentMethods[0].method);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentMethods]);

  const form = useForm<CheckoutFormInput>({
    resolver: zodResolver(buildCheckoutFormSchema(points.length > 0)),
    defaultValues: {
      customerName: "",
      customerPhone: "",
      customerEmail: "",
      deliveryMethodType: "",
      pickupPointId: "",
    },
  });

  useEffect(() => {
    if (!deliveryOptions.data) return;
    if (
      deliveryOptions.data.methods[0] && !form.getValues("deliveryMethodType")
    ) {
      form.setValue("deliveryMethodType", deliveryOptions.data.methods[0].type);
    }
    if (deliveryOptions.data.points[0] && !form.getValues("pickupPointId")) {
      form.setValue("pickupPointId", deliveryOptions.data.points[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deliveryOptions.data]);

  const customerPhone = form.watch("customerPhone");
  const deliveryMethodType = form.watch("deliveryMethodType");
  const pickupPointId = form.watch("pickupPointId");

  const onSubmit = form.handleSubmit(async (values) => {
    const result = await submitCheckout.mutateAsync({
      deliveryMethodType: values.deliveryMethodType,
      pickupPointId: values.deliveryMethodType === "PICKUP"
        ? values.pickupPointId
        : undefined,
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

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-3">
        {methods.length > 0 && (
          <Select
            {...form.register("deliveryMethodType")}
            selectClassName={selectClassName}
          >
            {methods.map((m) => (
              <option key={m.type} value={m.type}>
                {m.type === "PICKUP"
                  ? t("deliveryPickup")
                  : t("deliveryCourier")}
              </option>
            ))}
          </Select>
        )}

        {deliveryMethodType === "PICKUP" && points.length > 0 && (
          <Select
            {...form.register("pickupPointId")}
            selectClassName={selectClassName}
          >
            {points.map((point) => (
              <option key={point.id} value={point.id}>
                {point.label}
              </option>
            ))}
          </Select>
        )}

        {paymentMethods.length > 0 && (
          <Select
            value={paymentMethodId}
            onChange={(e) => setPaymentMethodId(e.target.value)}
            selectClassName={selectClassName}
          >
            {paymentMethods.map((method) => (
              <option key={method.method} value={method.method}>
                {method.method}
              </option>
            ))}
          </Select>
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
            !pickupPointId)}
        className="store-theme-primary-button rounded-xl px-5 py-3 text-sm font-semibold transition disabled:opacity-60"
      >
        {submitCheckout.isPending ? t("submitting") : t("submit")}
      </button>
    </form>
  );
}
