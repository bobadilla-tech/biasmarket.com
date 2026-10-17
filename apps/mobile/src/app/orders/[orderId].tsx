import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { customerAuth } from "@biasmarket/types";
import type { OrderPaymentResponseDto } from "@biasmarket/types";
import { useBuyerSession } from "../../features/auth/session-context";
import { formatPrice } from "../../features/catalog/catalog-ui";
import { fetchPrivatePaymentProof } from "../../features/orders/private-payment-proof";
import { useMobileI18n } from "../../i18n/mobile-i18n.js";

export default function OrderDetailScreen() {
  const { orderId, storeSlug: routeStoreSlug } = useLocalSearchParams<{
    orderId: string;
    storeSlug?: string;
  }>();
  const router = useRouter();
  const { status, storeSlug: sessionStoreSlug } = useBuyerSession();
  const storeSlug = routeStoreSlug ?? sessionStoreSlug;
  const { locale, t } = useMobileI18n();
  const orderQuery = useQuery({
    queryKey: ["buyer-order", storeSlug, orderId],
    queryFn: () => customerAuth.orderDetail(storeSlug!, orderId),
    enabled: status === "authenticated" && Boolean(storeSlug && orderId),
  });

  if (
    status === "loading" ||
    (status === "authenticated" && orderQuery.isPending)
  ) {
    return (
      <View className="flex-1 items-center justify-center bg-brand-ink">
        <ActivityIndicator color="#f2b4c7" />
      </View>
    );
  }

  if (status !== "authenticated" || !storeSlug) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-brand-ink px-6">
        <Text className="text-center text-white">
          {t("orders.loginToOpen")}
        </Text>
        <Pressable
          accessibilityRole="button"
          className="rounded-xl bg-brand-pink px-5 py-3"
          onPress={() => router.push("/login")}
        >
          <Text className="font-semibold text-brand-ink">
            {t("auth.signIn")}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (orderQuery.error || !orderQuery.data) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-brand-ink px-6">
        <Text accessibilityRole="alert" className="text-center text-red-200">
          {t("orders.openFailed")}
        </Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text className="font-semibold text-brand-pink">
            {t("orders.backToOrders")}
          </Text>
        </Pressable>
      </View>
    );
  }

  const order = orderQuery.data;
  return (
    <ScrollView
      className="flex-1 bg-brand-ink"
      contentContainerStyle={{ paddingBottom: 36 }}
    >
      <View className="gap-5 px-5 pt-12">
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text className="font-semibold text-brand-pink">
            ‹ {t("orders.title")}
          </Text>
        </Pressable>
        <View className="gap-2">
          <Text className="text-2xl font-bold text-white">
            {t("orders.order", { id: order.id.slice(0, 8) })}
          </Text>
          <Text className="text-sm text-white/60">
            {new Date(order.createdAt).toLocaleString(
              locale === "es" ? "es-PE" : "en-US",
            )}
          </Text>
        </View>

        <View className="gap-2 rounded-2xl border border-white/10 bg-white/5 p-4">
          <Text className="font-semibold text-white">
            {t("orders.paymentStatusLabel", {
              status: paymentStatusLabel(t, order.paymentStatus),
            })}
          </Text>
          <Text className="text-sm text-white/70">
            {t("orders.totalLabel", {
              amount: formatPrice(order.totalAmount, order.currency, locale),
            })}
          </Text>
          <Text className="text-sm text-white/70">
            {t("orders.pendingLabel", {
              amount: formatPrice(
                String(order.pendingAmount),
                order.currency,
                locale,
              ),
            })}
          </Text>
          <Text className="text-sm text-white/70">
            {t("orders.deliveryLabel", {
              method:
                order.deliveryMethodType === "PICKUP"
                  ? t("orders.pickup")
                  : `${t("checkout.courier")}${order.courierName ? ` · ${order.courierName}` : ""}`,
            })}
          </Text>
        </View>

        <Section title={t("orders.products")}>
          {order.items.map((item) => (
            <View
              key={item.id}
              className="flex-row items-center justify-between gap-3 border-b border-white/10 py-3"
            >
              <View className="flex-1 gap-1">
                <Text className="font-medium text-white">
                  {item.product.name}
                  {item.variant?.name ? ` · ${item.variant.name}` : ""}
                </Text>
                <Text className="text-xs text-white/60">
                  {t("orders.quantity", { count: item.quantity })}
                </Text>
              </View>
              <Text className="font-semibold text-brand-pink">
                {formatPrice(item.unitPriceAtPurchase, item.currency, locale)}
              </Text>
            </View>
          ))}
        </Section>

        <Section title={t("orders.paymentHistory")}>
          {order.payments.length === 0 ? (
            <Text className="text-sm text-white/60">
              {t("orders.noPayments")}
            </Text>
          ) : (
            order.payments.map((payment) => (
              <View
                key={payment.id}
                className="gap-3 border-b border-white/10 py-3"
              >
                <View className="flex-row items-center justify-between gap-3">
                  <Text className="font-medium text-white">
                    {payment.method ?? t("orders.payment")} ·{" "}
                    {paymentReviewLabel(t, payment.reviewStatus)}
                  </Text>
                  <Text className="font-semibold text-brand-pink">
                    {formatPrice(payment.amount, payment.currency, locale)}
                  </Text>
                </View>
                {payment.source === "BUYER_SUBMITTED" && payment.imageUrl ? (
                  <PrivatePaymentProof
                    storeSlug={storeSlug}
                    orderId={order.id}
                    payment={payment}
                  />
                ) : null}
              </View>
            ))
          )}
        </Section>
      </View>
    </ScrollView>
  );
}

function PrivatePaymentProof({
  storeSlug,
  orderId,
  payment,
}: {
  storeSlug: string;
  orderId: string;
  payment: OrderPaymentResponseDto;
}) {
  const { t } = useMobileI18n();
  const proofQuery = useQuery({
    queryKey: ["private-payment-proof", storeSlug, orderId, payment.id],
    queryFn: () => fetchPrivatePaymentProof(storeSlug, orderId, payment.id),
    enabled: payment.source === "BUYER_SUBMITTED" && Boolean(payment.imageUrl),
    staleTime: Infinity,
  });

  if (proofQuery.isPending) {
    return (
      <Text className="text-xs text-white/60">{t("orders.loadingProof")}</Text>
    );
  }
  if (proofQuery.error || !proofQuery.data) {
    return (
      <Text accessibilityRole="alert" className="text-xs text-red-200">
        {t("orders.proofFailed")}
      </Text>
    );
  }

  // Deliberately use React Native's core Image with an in-memory data URI.
  // Never pass payment.imageUrl to expo-image or any public CDN cache.
  return (
    <Image
      source={{ uri: proofQuery.data }}
      accessibilityLabel={t("orders.privatePaymentProof")}
      resizeMode="contain"
      style={{
        width: "100%",
        height: 240,
        borderRadius: 12,
        backgroundColor: "#27242a",
      }}
    />
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View className="gap-2 rounded-2xl border border-white/10 bg-white/5 p-4">
      <Text className="text-lg font-bold text-white">{title}</Text>
      {children}
    </View>
  );
}

function paymentStatusLabel(
  t: (key: string) => string,
  status: string,
): string {
  return t(`orders.paymentStatus.${status}`);
}

function paymentReviewLabel(
  t: (key: string) => string,
  status: string,
): string {
  return t(`orders.reviewStatus.${status}`);
}
