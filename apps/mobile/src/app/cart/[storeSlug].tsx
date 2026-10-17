import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { cartCurrency, cartTotal, hasMixedCurrencies } from "@biasmarket/utils/cart";
import { formatPrice } from "../../features/catalog/catalog-ui";
import { useStoreCart } from "../../features/cart/use-store-cart";

export default function CartScreen() {
  const { storeSlug } = useLocalSearchParams<{ storeSlug: string }>();
  const router = useRouter();
  const cart = useStoreCart(storeSlug);
  const mixedCurrencies = hasMixedCurrencies(cart.items);
  const currency = cartCurrency(cart.items);

  if (cart.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-brand-ink">
        <ActivityIndicator color="#f2b4c7" />
        <Text className="mt-3 text-white/70">Cargando carrito...</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-brand-ink" contentContainerStyle={{ paddingBottom: 36 }}>
      <View className="flex-row items-center justify-between px-5 pb-5 pt-12">
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text className="font-semibold text-brand-pink">‹ Volver</Text>
        </Pressable>
        <Text className="text-xl font-bold text-white">Tu carrito</Text>
        <View className="w-12" />
      </View>

      {cart.items.length === 0 ? (
        <View className="items-center gap-4 px-6 pt-20">
          <Text className="text-center text-white/70">
            Todavía no agregaste productos de esta tienda.
          </Text>
          <Pressable
            accessibilityRole="button"
            className="rounded-xl bg-brand-pink px-5 py-3"
            onPress={() => router.push("/search")}
          >
            <Text className="font-semibold text-brand-ink">Explorar productos</Text>
          </Pressable>
        </View>
      ) : (
        <View className="gap-4 px-5">
          {cart.items.map((item) => (
            <View
              key={`${item.productId}:${item.variantId ?? ""}`}
              className="gap-3 rounded-2xl border border-white/10 bg-white/5 p-4"
            >
              <View className="flex-row items-start justify-between gap-4">
                <View className="flex-1 gap-1">
                  <Text className="font-semibold text-white">{item.name}</Text>
                  {item.variantLabel ? (
                    <Text className="text-sm text-white/60">{item.variantLabel}</Text>
                  ) : null}
                  <Text className="text-sm text-brand-pink">
                    {formatPrice(String(item.price), item.currency)}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Quitar ${item.name} del carrito`}
                  onPress={() => cart.remove(item)}
                >
                  <Text className="text-sm text-red-300">Quitar</Text>
                </Pressable>
              </View>
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-4">
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Reducir cantidad de ${item.name}`}
                    className="h-9 w-9 items-center justify-center rounded-full bg-white/10"
                    onPress={() => cart.setQuantity(item, item.quantity - 1)}
                  >
                    <Text className="text-lg text-white">−</Text>
                  </Pressable>
                  <Text accessibilityLabel="Cantidad" className="font-semibold text-white">
                    {item.quantity}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Aumentar cantidad de ${item.name}`}
                    className="h-9 w-9 items-center justify-center rounded-full bg-white/10"
                    onPress={() => cart.setQuantity(item, item.quantity + 1)}
                  >
                    <Text className="text-lg text-white">+</Text>
                  </Pressable>
                </View>
                <Text className="font-bold text-white">
                  {formatPrice(String(item.price * item.quantity), item.currency)}
                </Text>
              </View>
            </View>
          ))}

          {mixedCurrencies ? (
            <Text accessibilityRole="alert" className="rounded-xl bg-red-400/10 p-3 text-sm text-red-200">
              El carrito tiene productos en monedas distintas. Separa los productos antes de continuar.
            </Text>
          ) : null}
          <View className="flex-row justify-between border-t border-white/15 pt-4">
            <Text className="text-lg font-semibold text-white">Total</Text>
            <Text className="text-lg font-bold text-brand-pink">
              {currency ? formatPrice(String(cartTotal(cart.items)), currency) : "—"}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            className="rounded-xl bg-brand-pink px-5 py-4"
            onPress={() => router.push("/search")}
          >
            <Text className="text-center font-bold text-brand-ink">Seguir explorando</Text>
          </Pressable>
          {cart.error ? (
            <Text accessibilityRole="alert" className="text-center text-sm text-red-200">
              No se pudo guardar el cambio. Intenta de nuevo.
            </Text>
          ) : null}
        </View>
      )}
    </ScrollView>
  );
}
