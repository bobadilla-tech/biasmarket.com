import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  cartCurrency,
  cartTotal,
  hasMixedCurrencies,
} from "@biasmarket/utils/cart";
import { formatPrice } from "../../features/catalog/catalog-ui";
import { useStoreCart } from "../../features/cart/use-store-cart";
import { useMobileI18n } from "../../i18n/mobile-i18n";

export default function CartScreen() {
  const { storeSlug } = useLocalSearchParams<{ storeSlug: string }>();
  const router = useRouter();
  const cart = useStoreCart(storeSlug);
  const { locale, t } = useMobileI18n();
  const mixedCurrencies = hasMixedCurrencies(cart.items);
  const currency = cartCurrency(cart.items);

  if (cart.isLoading) {
    return (
      <View className="flex-1 items-center justify-center bg-brand-ink">
        <ActivityIndicator color="#f2b4c7" />
        <Text className="mt-3 text-white/70">{t("common.loadingCart")}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      className="flex-1 bg-brand-ink"
      contentContainerStyle={{ paddingBottom: 36 }}
    >
      <View className="flex-row items-center justify-between px-5 pb-5 pt-12">
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text className="font-semibold text-brand-pink">
            ‹ {t("common.back")}
          </Text>
        </Pressable>
        <Text className="text-xl font-bold text-white">{t("cart.title")}</Text>
        <View className="w-12" />
      </View>

      {cart.items.length === 0 ? (
        <View className="items-center gap-4 px-6 pt-20">
          <Text className="text-center text-white/70">
            {t("cart.emptyStore")}
          </Text>
          <Pressable
            accessibilityRole="button"
            className="rounded-xl bg-brand-pink px-5 py-3"
            onPress={() => router.push("/search")}
          >
            <Text className="font-semibold text-brand-ink">
              {t("cart.explore")}
            </Text>
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
                    <Text className="text-sm text-white/60">
                      {item.variantLabel}
                    </Text>
                  ) : null}
                  <Text className="text-sm text-brand-pink">
                    {formatPrice(String(item.price), item.currency, locale)}
                  </Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t("cart.removeItem", {
                    item: item.name,
                  })}
                  onPress={() => cart.remove(item)}
                >
                  <Text className="text-sm text-red-300">
                    {t("cart.remove")}
                  </Text>
                </Pressable>
              </View>
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-4">
                  <Pressable
                    accessibilityRole="button"
                    disabled={cart.isSaving}
                    accessibilityLabel={t("cart.decreaseQuantity", {
                      item: item.name,
                    })}
                    className="h-9 w-9 items-center justify-center rounded-full bg-white/10"
                    onPress={() => cart.setQuantity(item, item.quantity - 1)}
                  >
                    <Text className="text-lg text-white">−</Text>
                  </Pressable>
                  <Text
                    accessibilityLabel={t("cart.quantity")}
                    className="font-semibold text-white"
                  >
                    {item.quantity}
                  </Text>
                  <Pressable
                    accessibilityRole="button"
                    disabled={cart.isSaving}
                    accessibilityLabel={t("cart.increaseQuantity", {
                      item: item.name,
                    })}
                    className="h-9 w-9 items-center justify-center rounded-full bg-white/10"
                    onPress={() => cart.setQuantity(item, item.quantity + 1)}
                  >
                    <Text className="text-lg text-white">+</Text>
                  </Pressable>
                </View>
                <Text className="font-bold text-white">
                  {formatPrice(
                    String(item.price * item.quantity),
                    item.currency,
                    locale,
                  )}
                </Text>
              </View>
            </View>
          ))}

          {mixedCurrencies ? (
            <Text
              accessibilityRole="alert"
              className="rounded-xl bg-red-400/10 p-3 text-sm text-red-200"
            >
              {t("cart.mixedCurrencyNotice")}
            </Text>
          ) : null}
          <View className="flex-row justify-between border-t border-white/15 pt-4">
            <Text className="text-lg font-semibold text-white">
              {t("cart.total")}
            </Text>
            <Text className="text-lg font-bold text-brand-pink">
              {currency
                ? formatPrice(String(cartTotal(cart.items)), currency, locale)
                : "—"}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            className="rounded-xl bg-brand-pink px-5 py-4"
            onPress={() => router.push("/search")}
          >
            <Text className="text-center font-bold text-brand-ink">
              {t("catalog.keepBrowsing")}
            </Text>
          </Pressable>
        </View>
      )}
      {cart.error ? (
        <Text
          accessibilityRole="alert"
          className="mx-5 mt-4 text-center text-sm text-red-200"
        >
          {t("cart.saveFailed")}
        </Text>
      ) : null}
    </ScrollView>
  );
}
