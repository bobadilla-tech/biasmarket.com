import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { customerAuth } from "@biasmarket/types";
import { useBuyerSession } from "../../features/auth/session-context";
import { formatPrice } from "../../features/catalog/catalog-ui";

export default function OrderHistoryScreen() {
  const router = useRouter();
  const { status, storeSlug } = useBuyerSession();
  const ordersQuery = useQuery({
    queryKey: ["buyer", storeSlug, "orders"],
    queryFn: async () => (await customerAuth.me(storeSlug!)).orders,
    enabled: status === "authenticated" && Boolean(storeSlug),
  });

  if (status === "loading" || (status === "authenticated" && ordersQuery.isPending)) {
    return (
      <View className="flex-1 items-center justify-center bg-brand-ink">
        <ActivityIndicator color="#f2b4c7" />
      </View>
    );
  }

  if (status !== "authenticated" || !storeSlug) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-brand-ink px-6">
        <Text className="text-center text-white">Inicia sesión para ver tus pedidos.</Text>
        <Pressable accessibilityRole="button" className="rounded-xl bg-brand-pink px-5 py-3" onPress={() => router.push("/login")}>
          <Text className="font-semibold text-brand-ink">Iniciar sesión</Text>
        </Pressable>
      </View>
    );
  }

  if (ordersQuery.error) {
    return (
      <View className="flex-1 items-center justify-center bg-brand-ink px-6">
        <Text accessibilityRole="alert" className="text-center text-red-200">
          No pudimos cargar tus pedidos. Intenta de nuevo.
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-brand-ink px-5 pt-12">
      <View className="mb-4 flex-row items-center justify-between">
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text className="font-semibold text-brand-pink">‹ Volver</Text>
        </Pressable>
        <Text className="text-2xl font-bold text-white">Mis pedidos</Text>
        <View className="w-12" />
      </View>
      <FlashList
        data={ordersQuery.data ?? []}
        keyExtractor={(order) => order.id}
        refreshing={ordersQuery.isRefetching}
        onRefresh={() => void ordersQuery.refetch()}
        ListEmptyComponent={
          <Text className="py-12 text-center text-white/60">
            Todavía no tienes pedidos registrados.
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            className="mb-3 gap-2 rounded-2xl border border-white/10 bg-white/5 p-4"
            onPress={() => router.push({ pathname: "/orders/[orderId]", params: { orderId: item.id, storeSlug } })}
          >
            <View className="flex-row items-center justify-between">
              <Text className="font-semibold text-white">Pedido {item.id.slice(0, 8)}</Text>
              <Text className="text-xs text-brand-pink">{paymentStatusLabel(item.paymentStatus)}</Text>
            </View>
            <View className="flex-row items-center justify-between">
              <Text className="text-sm text-white/60">{new Date(item.createdAt).toLocaleDateString("es-PE")}</Text>
              <Text className="font-semibold text-white">{formatPrice(item.totalAmount, item.currency)}</Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

function paymentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING_PAYMENT: "Pendiente de pago",
    PARTIALLY_PAID: "Pago parcial",
    PAYMENT_SUBMITTED: "En revisión",
    VERIFIED: "Pagado",
    REJECTED: "Pago rechazado",
    CANCELLED: "Cancelado",
  };
  return labels[status] ?? status;
}
