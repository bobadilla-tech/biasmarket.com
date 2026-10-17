import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as ImagePicker from "expo-image-picker";
import {
  ApiError,
  customFetch,
  customerAuth,
  publicDeliveryConfig,
  publicPaymentConfig,
  publicPickupPoints,
  publicCouriers,
  stores,
} from "@biasmarket/types";
import type {
  CheckoutResultResponseDto,
  CreateOrderDto,
  PaymentMethodConfigResponseDto,
  PickupPointResponseDto,
  ShippingAddressDto,
} from "@biasmarket/types";
import {
  buildCheckoutFormSchema,
  type CheckoutFormInput,
  type ProofFileLike,
} from "@biasmarket/validation";
import { isPaymentMethodConfigured } from "@biasmarket/utils/payment-methods";
import type { CheckoutPaymentMethod } from "@biasmarket/utils/payment-methods";
import {
  cartCurrency,
  cartTotal,
  hasMixedCurrencies,
} from "@biasmarket/utils/cart";
import type { CartItem } from "@biasmarket/utils/cart";
import { formatPrice } from "../../features/catalog/catalog-ui";
import {
  clearStoreCart,
  readStoreCart,
} from "../../features/cart/cart-storage";
import { useBuyerSession } from "../../features/auth/session-context";
import {
  compressPaymentProof,
  proofSelectionErrorKey,
} from "../../features/checkout/proof-image";
import { useMobileI18n } from "../../i18n/mobile-i18n.js";

const emptyForm: CheckoutFormInput = {
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
};
const EMPTY_POINTS: PickupPointResponseDto[] = [];
const EMPTY_PAYMENT_METHODS: PaymentMethodConfigResponseDto[] = [];

export default function CheckoutScreen() {
  const { storeSlug } = useLocalSearchParams<{ storeSlug: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const session = useBuyerSession();
  const { locale, t } = useMobileI18n();
  const [form, setForm] = useState(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<string[]>([]);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadingProof, setLoadingProof] = useState(false);

  const cartQuery = useQuery({
    queryKey: ["cart", storeSlug],
    queryFn: () => readStoreCart(storeSlug),
    enabled: Boolean(storeSlug),
  });
  const deliveryQuery = useQuery({
    queryKey: ["checkout", storeSlug, "delivery"],
    queryFn: () => publicDeliveryConfig.findEnabled(storeSlug),
    enabled: Boolean(storeSlug),
  });
  const pickupQuery = useQuery({
    queryKey: ["checkout", storeSlug, "pickup"],
    queryFn: () => publicPickupPoints.findEnabled(storeSlug),
    enabled: Boolean(storeSlug),
  });
  const paymentQuery = useQuery({
    queryKey: ["checkout", storeSlug, "payment"],
    queryFn: () => publicPaymentConfig.findEnabled(storeSlug),
    enabled: Boolean(storeSlug),
  });
  const courierQuery = useQuery({
    queryKey: ["checkout", storeSlug, "couriers"],
    queryFn: () => publicCouriers.findEnabled(storeSlug),
    enabled: Boolean(storeSlug),
  });
  const storeQuery = useQuery({
    queryKey: ["checkout", storeSlug, "store"],
    queryFn: () => stores.findPublic(storeSlug),
    enabled: Boolean(storeSlug),
  });
  const profileQuery = useQuery({
    queryKey: ["buyer", storeSlug, "profile"],
    queryFn: () => customerAuth.me(storeSlug),
    enabled:
      session.status === "authenticated" && session.storeSlug === storeSlug,
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 401) && failureCount < 2,
  });

  const items = cartQuery.data ?? [];
  const deliveryMethods = deliveryQuery.data ?? [];
  const points = pickupQuery.data?.points ?? EMPTY_POINTS;
  const weekday = pickupQuery.data?.weekday ?? new Date().getDay();
  const paymentMethods = paymentQuery.data ?? EMPTY_PAYMENT_METHODS;
  const couriers = courierQuery.data ?? [];
  const unavailableManualMethods = useMemo(
    () =>
      new Set(
        paymentMethods
          .filter(
            (method) =>
              method.method !== "CASH" &&
              !isPaymentMethodConfigured(method.method, method.details),
          )
          .map((method) => method.method),
      ),
    [paymentMethods],
  );
  const pointsRequiringDate = useMemo(
    () =>
      new Set(
        points
          .filter(
            (point) =>
              !point.closedOverride &&
              point.openDays.length > 0 &&
              !point.openDays.includes(weekday),
          )
          .map((point) => point.id),
      ),
    [points, weekday],
  );
  const schema = useMemo(
    () =>
      buildCheckoutFormSchema(
        points.length > 0,
        paymentMethods.length > 0,
        pointsRequiringDate,
        unavailableManualMethods,
      ),
    [
      points.length,
      paymentMethods.length,
      pointsRequiringDate,
      unavailableManualMethods,
    ],
  );

  function setField<K extends keyof CheckoutFormInput>(
    key: K,
    value: CheckoutFormInput[K],
  ) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function chooseProof(useCamera: boolean) {
    setSubmitError(null);
    setLoadingProof(true);
    try {
      const permission = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setSubmitError(t("checkout.permissionRequired"));
        return;
      }
      const result = useCamera
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ["images"] })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"] });
      if (result.canceled || !result.assets[0]) return;
      const proof = await compressPaymentProof(result.assets[0].uri);
      setField("paymentProof", proof);
    } catch (error) {
      setSubmitError(t(proofSelectionErrorKey(error)));
    } finally {
      setLoadingProof(false);
    }
  }

  async function submitCheckout() {
    setSubmitError(null);
    const profile = profileQuery.data?.customer;
    const values = {
      ...form,
      customerName: form.customerName || profile?.name || "",
      customerPhone: form.customerPhone || profile?.phone || "",
      customerEmail: form.customerEmail || profile?.email || "",
    };
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      setFieldErrors(
        parsed.error.issues.map((issue) =>
          t(`checkout.validation.${String(issue.path[0])}`),
        ),
      );
      return;
    }
    setFieldErrors([]);
    if (items.length === 0) {
      setSubmitError(t("checkout.noItems"));
      return;
    }
    if (hasMixedCurrencies(items)) {
      setSubmitError(t("checkout.mixedCurrencies"));
      return;
    }
    if (!/^[a-z0-9-]+$/i.test(storeSlug)) {
      setSubmitError(t("checkout.storeInvalid"));
      return;
    }

    setSubmitting(true);
    try {
      const address = toShippingAddress(parsed.data);
      const order: CreateOrderDto = {
        deliveryMethodType: parsed.data
          .deliveryMethodType as CreateOrderDto["deliveryMethodType"],
        customerName: parsed.data.customerName || undefined,
        customerPhone: parsed.data.customerPhone,
        customerEmail: parsed.data.customerEmail || undefined,
        pickupPointId: parsed.data.pickupPointId || undefined,
        pickupDate: parsed.data.pickupDate || undefined,
        paymentMethod: parsed.data.paymentMethod
          ? (parsed.data.paymentMethod as CreateOrderDto["paymentMethod"])
          : undefined,
        paymentType: parsed.data.paymentType,
        courierName: parsed.data.courierName || undefined,
        courierModality: parsed.data.courierModality
          ? (parsed.data.courierModality as CreateOrderDto["courierModality"])
          : undefined,
        shippingAddress: address,
        items: items.map(({ productId, variantId, quantity }) => ({
          productId,
          variantId,
          quantity,
        })),
      };
      const body = new FormData();
      body.append("deliveryMethodType", order.deliveryMethodType);
      body.append("customerPhone", order.customerPhone);
      body.append("paymentType", order.paymentType ?? "FULL");
      if (order.customerName) body.append("customerName", order.customerName);
      if (order.customerEmail)
        body.append("customerEmail", order.customerEmail);
      if (order.pickupPointId)
        body.append("pickupPointId", order.pickupPointId);
      if (order.pickupDate) body.append("pickupDate", order.pickupDate);
      if (order.paymentMethod)
        body.append("paymentMethod", order.paymentMethod);
      if (order.courierName) body.append("courierName", order.courierName);
      if (order.courierModality)
        body.append("courierModality", order.courierModality);
      if (address) body.append("shippingAddress", JSON.stringify(address));
      body.append("items", JSON.stringify(order.items));
      if (form.paymentProof && order.paymentMethod !== "CASH") {
        const proof = form.paymentProof as ProofFileLike & { uri: string };
        body.append("file", {
          uri: proof.uri,
          name: proof.name,
          type: proof.type ?? "image/jpeg",
        } as unknown as Blob);
      }

      const result = await customFetch<CheckoutResultResponseDto>(
        `/stores/${encodeURIComponent(storeSlug)}/checkout`,
        { method: "POST", body },
      );
      await clearStoreCart(storeSlug);
      queryClient.setQueryData(["cart", storeSlug], [] satisfies CartItem[]);
      router.replace({
        pathname: "/checkout/success/[orderId]",
        params: {
          orderId: result.order.id,
          paymentStatus: result.order.paymentStatus,
          proofSubmitted: String(
            Boolean(form.paymentProof && order.paymentMethod !== "CASH"),
          ),
        },
      });
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : t("checkout.submitFailed"),
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (
    cartQuery.isPending ||
    deliveryQuery.isPending ||
    pickupQuery.isPending ||
    paymentQuery.isPending
  ) {
    return (
      <View className="flex-1 items-center justify-center bg-brand-ink">
        <ActivityIndicator color="#f2b4c7" />
        <Text className="mt-3 text-white/70">{t("checkout.preparing")}</Text>
      </View>
    );
  }

  const selectedPayment = paymentMethods.find(
    (method) => method.method === form.paymentMethod,
  );
  const qrImageUrl = selectedPayment?.details.qrImageUrl;

  return (
    <ScrollView
      className="flex-1 bg-brand-ink"
      contentContainerStyle={{ paddingBottom: 44 }}
      keyboardShouldPersistTaps="handled"
    >
      <View className="gap-5 px-5 pt-12">
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text className="font-semibold text-brand-pink">
            ‹ {t("checkout.backToCart")}
          </Text>
        </Pressable>
        <Text className="text-3xl font-bold text-white">
          {t("checkout.title")}
        </Text>
        <Text className="text-sm text-white/60">
          {t("checkout.items", { count: items.length })} ·{" "}
          {cartCurrency(items)
            ? formatPrice(
                String(cartTotal(items)),
                cartCurrency(items)!,
                locale,
              )
            : "—"}
        </Text>
        {session.status !== "authenticated" ||
        session.storeSlug !== storeSlug ? (
          <Pressable
            accessibilityRole="button"
            onPress={() =>
              router.push({
                pathname: "/login",
                params: { storeSlug, returnTo: "checkout" },
              })
            }
          >
            <Text className="text-sm font-semibold text-brand-pink">
              {t("checkout.loginToFill")}
            </Text>
          </Pressable>
        ) : null}

        <Section title={t("checkout.yourDetails")}>
          <Field
            label={t("checkout.name")}
            value={form.customerName || profileQuery.data?.customer.name || ""}
            onChangeText={(value) => setField("customerName", value)}
          />
          <Field
            label={t("checkout.phone")}
            keyboardType="phone-pad"
            value={
              form.customerPhone || profileQuery.data?.customer.phone || ""
            }
            onChangeText={(value) => setField("customerPhone", value)}
          />
          <Field
            label={t("checkout.email")}
            keyboardType="email-address"
            autoCapitalize="none"
            value={
              form.customerEmail || profileQuery.data?.customer.email || ""
            }
            onChangeText={(value) => setField("customerEmail", value)}
          />
        </Section>

        <Section title={t("checkout.delivery")}>
          {deliveryMethods.map((method) => (
            <Choice
              key={method.type}
              label={
                method.type === "PICKUP"
                  ? t("checkout.pickup")
                  : t("checkout.courier")
              }
              selected={form.deliveryMethodType === method.type}
              onPress={() => setField("deliveryMethodType", method.type)}
            />
          ))}
          {form.deliveryMethodType === "PICKUP" && points.length ? (
            <>
              <Text className="font-medium text-white">
                {t("checkout.pickupPoint")}
              </Text>
              {points.map((point) => (
                <Choice
                  key={point.id}
                  label={point.label}
                  selected={form.pickupPointId === point.id}
                  onPress={() => setField("pickupPointId", point.id)}
                />
              ))}
              {form.pickupPointId &&
              pointsRequiringDate.has(form.pickupPointId) ? (
                <Field
                  label={t("checkout.pickupDate")}
                  value={form.pickupDate}
                  onChangeText={(value) => setField("pickupDate", value)}
                  placeholder={t("checkout.datePlaceholder")}
                />
              ) : null}
            </>
          ) : null}
          {form.deliveryMethodType === "COURIER" ? (
            <>
              <Text className="font-medium text-white">
                {t("checkout.courier")}
              </Text>
              {courierQuery.data?.map((courier) => (
                <Choice
                  key={courier.id}
                  label={courier.name}
                  selected={form.courierName === courier.name}
                  onPress={() => setField("courierName", courier.name)}
                />
              ))}
              {courierQuery.data
                ?.find((courier) => courier.name === form.courierName)
                ?.modalities.map(({ modality }) => (
                  <Choice
                    key={modality}
                    label={
                      modality === "HOME"
                        ? t("checkout.homeDelivery")
                        : t("checkout.agency")
                    }
                    selected={form.courierModality === modality}
                    onPress={() => setField("courierModality", modality)}
                  />
                ))}
              <Field
                label={t("checkout.recipientName")}
                value={form.shippingRecipientName}
                onChangeText={(value) =>
                  setField("shippingRecipientName", value)
                }
              />
              <Field
                label={t("checkout.surnames")}
                value={form.shippingRecipientSurnames}
                onChangeText={(value) =>
                  setField("shippingRecipientSurnames", value)
                }
              />
              <Field
                label={t("checkout.contactPhone")}
                keyboardType="phone-pad"
                value={form.shippingPhone}
                onChangeText={(value) => setField("shippingPhone", value)}
              />
              {form.courierModality === "HOME" ? (
                <>
                  <Field
                    label={t("checkout.address")}
                    value={form.shippingLine1}
                    onChangeText={(value) => setField("shippingLine1", value)}
                  />
                  <Field
                    label={t("checkout.city")}
                    value={form.shippingCity}
                    onChangeText={(value) => setField("shippingCity", value)}
                  />
                  <Field
                    label={t("checkout.district")}
                    value={form.shippingDistrict}
                    onChangeText={(value) =>
                      setField("shippingDistrict", value)
                    }
                  />
                  <Field
                    label={t("checkout.province")}
                    value={form.shippingProvince}
                    onChangeText={(value) =>
                      setField("shippingProvince", value)
                    }
                  />
                  <Field
                    label={t("checkout.department")}
                    value={form.shippingDepartment}
                    onChangeText={(value) =>
                      setField("shippingDepartment", value)
                    }
                  />
                  <Field
                    label={t("checkout.reference")}
                    value={form.shippingReference}
                    onChangeText={(value) =>
                      setField("shippingReference", value)
                    }
                  />
                </>
              ) : null}
              {form.courierModality === "AGENCY" ? (
                <Field
                  label={t("checkout.agencyName")}
                  value={form.shippingAgencyName}
                  onChangeText={(value) =>
                    setField("shippingAgencyName", value)
                  }
                />
              ) : null}
            </>
          ) : null}
        </Section>

        <Section title={t("checkout.payment")}>
          {paymentMethods.map((method) => (
            <Choice
              key={method.method}
              label={t(`checkout.paymentMethods.${method.method}`)}
              selected={form.paymentMethod === method.method}
              onPress={() => setField("paymentMethod", method.method)}
            />
          ))}
          {selectedPayment ? (
            <Text className="text-sm text-white/70">
              {paymentDescription(selectedPayment)}
            </Text>
          ) : null}
          {form.paymentMethod && storeQuery.data?.paymentInstructions ? (
            <Text className="text-sm leading-5 text-white/70">
              {storeQuery.data.paymentInstructions}
            </Text>
          ) : null}
          {typeof qrImageUrl === "string" ? (
            <Image
              source={{ uri: qrImageUrl }}
              contentFit="contain"
              cachePolicy="memory-disk"
              style={{ width: 180, height: 180, alignSelf: "center" }}
            />
          ) : null}
          {form.paymentMethod &&
          form.paymentMethod !== "CASH" &&
          !unavailableManualMethods.has(
            form.paymentMethod as CheckoutPaymentMethod,
          ) ? (
            <>
              <Text className="font-medium text-white">
                {t("checkout.paymentType")}
              </Text>
              <Choice
                label={t("checkout.fullPayment")}
                selected={form.paymentType === "FULL"}
                onPress={() => setField("paymentType", "FULL")}
              />
              <Choice
                label={t("checkout.partialPayment")}
                selected={form.paymentType === "PARTIAL"}
                onPress={() => setField("paymentType", "PARTIAL")}
              />
              <View className="flex-row gap-2">
                <Pressable
                  accessibilityRole="button"
                  className="flex-1 rounded-xl bg-white/10 p-3"
                  disabled={loadingProof}
                  onPress={() => void chooseProof(true)}
                >
                  <Text className="text-center text-white">
                    {t("checkout.takePhoto")}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  className="flex-1 rounded-xl bg-white/10 p-3"
                  disabled={loadingProof}
                  onPress={() => void chooseProof(false)}
                >
                  <Text className="text-center text-white">
                    {t("checkout.chooseImage")}
                  </Text>
                </Pressable>
              </View>
              <Text className="text-sm text-white/60">
                {loadingProof
                  ? t("checkout.compressingImage")
                  : form.paymentProof
                    ? t("checkout.proofReady", {
                        filename: form.paymentProof.name,
                      })
                    : t("checkout.proofInstructions")}
              </Text>
            </>
          ) : null}
        </Section>

        {fieldErrors.length ? (
          <View
            accessibilityRole="alert"
            className="gap-1 rounded-xl bg-red-400/10 p-4"
          >
            {fieldErrors.map((message, index) => (
              <Text
                key={`${message}-${index}`}
                className="text-sm text-red-200"
              >
                {message}
              </Text>
            ))}
          </View>
        ) : null}
        {submitError ? (
          <Text accessibilityRole="alert" className="text-sm text-red-200">
            {submitError}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={submitting || loadingProof || items.length === 0}
          className="rounded-xl bg-brand-pink px-5 py-4 disabled:opacity-50"
          onPress={() => void submitCheckout()}
        >
          <Text className="text-center font-bold text-brand-ink">
            {submitting ? t("checkout.submitting") : t("checkout.confirmOrder")}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function toShippingAddress(
  form: CheckoutFormInput,
): ShippingAddressDto | undefined {
  if (form.deliveryMethodType !== "COURIER") return undefined;
  return {
    recipientName: form.shippingRecipientName,
    recipientSurnames: form.shippingRecipientSurnames || undefined,
    phone: form.shippingPhone,
    documentType: form.shippingDocumentType || undefined,
    documentNumber: form.shippingDocumentNumber || undefined,
    department: form.shippingDepartment || undefined,
    province: form.shippingProvince || undefined,
    district: form.shippingDistrict || undefined,
    line1: form.shippingLine1 || undefined,
    line2: form.shippingLine2 || undefined,
    city: form.shippingCity || undefined,
    region: form.shippingRegion || undefined,
    reference: form.shippingReference || undefined,
    agencyName: form.shippingAgencyName || undefined,
  };
}

function paymentDescription(method: PaymentMethodConfigResponseDto): string {
  const details = method.details;
  return [
    details.bankName,
    details.accountType,
    details.accountNumber,
    details.accountHolder,
    details.phoneNumber,
  ]
    .filter(
      (value): value is string => typeof value === "string" && value.length > 0,
    )
    .join(" · ");
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-3 rounded-2xl border border-white/10 bg-white/5 p-4">
      <Text className="text-lg font-bold text-white">{title}</Text>
      {children}
    </View>
  );
}

function Field({ label, ...props }: TextInputProps & { label: string }) {
  return (
    <View className="gap-1">
      <Text className="text-sm font-medium text-white/80">{label}</Text>
      <TextInput
        {...props}
        className="rounded-xl border border-white/15 bg-black/10 px-4 py-3 text-white"
        placeholderTextColor="#aaa"
      />
    </View>
  );
}

function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      className={`rounded-xl border px-4 py-3 ${selected ? "border-brand-pink bg-brand-pink/10" : "border-white/10 bg-white/5"}`}
      onPress={onPress}
    >
      <Text
        className={selected ? "font-semibold text-brand-pink" : "text-white"}
      >
        {label}
      </Text>
    </Pressable>
  );
}
