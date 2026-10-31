import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@biasmarket/types";
import { useBuyerSession } from "../../features/auth/session-context";
import { formatPrice } from "../../features/catalog/catalog-ui";
import { useMobileI18n } from "../../i18n/mobile-i18n.js";

interface GlobalAccountOrder {
  id: string;
  paymentStatus: string;
  totalAmount: string;
  currency: string;
  createdAt: string;
  storeSlug: string;
  storeName: string;
}

export default function OrderHistoryScreen() {
  const router = useRouter();
  const { status } = useBuyerSession();
  const { locale, t } = useMobileI18n();
  const ordersQuery = useQuery({
    queryKey: ["buyer", "orders"],
    queryFn: () => customFetch<GlobalAccountOrder[]>("/account/orders"),
    enabled: status === "authenticated",
  });

  if (
    status === "loading" ||
    (status === "authenticated" && ordersQuery.isPending)
  ) {
    return (
      <View className="flex-1 items-center justify-center bg-brand-ink">
        <ActivityIndicator color="#f2b4c7" />
      </View>
    );
  }

  if (status !== "authenticated") {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-brand-ink px-6">
        <Text className="text-center text-white">
          {t("orders.loginPrompt")}
        </Text>
        <Pressable
          accessibilityRole="button"
          className="rounded-xl bg-brand-pink px-5 py-3"
          onPress={() =>
            router.push({ pathname: "/login", params: { returnTo: "orders" } })
          }
        >
          <Text className="font-semibold text-brand-ink">
            {t("auth.loginTitle")}
          </Text>
        </Pressable>
      </View>
    );
  }

  if (ordersQuery.error) {
    return (
      <View className="flex-1 items-center justify-center bg-brand-ink px-6">
        <Text accessibilityRole="alert" className="text-center text-red-200">
          {t("orders.loadFailed")}
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-brand-ink px-5 pt-12">
      <View className="mb-4 flex-row items-center justify-between">
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text className="font-semibold text-brand-pink">
            ‹ {t("common.back")}
          </Text>
        </Pressable>
        <Text className="text-2xl font-bold text-white">
          {t("orders.title")}
        </Text>
        <View className="w-12" />
      </View>
      <FlashList
        data={ordersQuery.data ?? []}
        keyExtractor={(order) => order.id}
        refreshing={ordersQuery.isRefetching}
        onRefresh={() => void ordersQuery.refetch()}
        ListEmptyComponent={
          <Text className="py-12 text-center text-white/60">
            {t("orders.empty")}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            className="mb-3 gap-2 rounded-2xl border border-white/10 bg-white/5 p-4"
            onPress={() =>
              router.push({
                pathname: "/orders/[orderId]",
                params: { orderId: item.id, storeSlug: item.storeSlug },
              })
            }
          >
            <View className="flex-row items-center justify-between">
              <Text className="font-semibold text-white">
                {t("orders.order", { id: item.id.slice(0, 8) })}
              </Text>
              <Text className="text-xs text-brand-pink">
                {paymentStatusLabel(t, item.paymentStatus)}
              </Text>
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-white/60">
                {item.storeName} ·{" "}
                {new Date(item.createdAt).toLocaleDateString(
                  locale === "es" ? "es-PE" : "en-US",
                )}
              </Text>
              <Text className="font-semibold text-white">
                {formatPrice(item.totalAmount, item.currency, locale)}
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

function paymentStatusLabel(
  t: (key: string) => string,
  status: string,
): string {
  return t(`orders.paymentStatus.${status}`);
}
