import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { stores } from "@biasmarket/types";
import type { PublicProductVariantResponseDto } from "@biasmarket/types";
import { formatPrice } from "../../../features/catalog/catalog-ui";
import { cartCount } from "@biasmarket/utils/cart";
import { useStoreCart } from "../../../features/cart/use-store-cart";
import { useMobileI18n } from "../../../i18n/mobile-i18n";

export default function ProductDetailScreen() {
  const { storeSlug, productId } = useLocalSearchParams<{
    storeSlug: string;
    productId: string;
  }>();
  const router = useRouter();
  const cart = useStoreCart(storeSlug);
  const { locale, t } = useMobileI18n();
  const productQuery = useQuery({
    queryKey: ["catalog", "product", storeSlug, productId],
    queryFn: () => stores.findPublicProduct(storeSlug, productId),
    enabled: Boolean(storeSlug && productId),
  });

  if (productQuery.isPending) {
    return (
      <View className="flex-1 items-center justify-center bg-brand-ink">
        <ActivityIndicator color="#f2b4c7" />
        <Text className="mt-3 text-white/70">{t("common.loadingProduct")}</Text>
      </View>
    );
  }

  if (productQuery.error || !productQuery.data) {
    return (
      <View className="flex-1 items-center justify-center gap-4 bg-brand-ink px-6">
        <Text className="text-center text-white">{t("catalog.notFound")}</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text className="font-semibold text-brand-pink">
            {t("catalog.backToCatalog")}
          </Text>
        </Pressable>
      </View>
    );
  }

  const { store, product } = productQuery.data;
  const unavailable = product.soldOut || product.discontinued;

  return (
    <ScrollView
      className="flex-1 bg-brand-ink"
      contentContainerStyle={{ paddingBottom: 36 }}
    >
      <View className="flex-row items-center justify-between px-5 pb-3 pt-12">
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text className="font-semibold text-brand-pink">
            ‹ {t("common.back")}
          </Text>
        </Pressable>
        <Text numberOfLines={1} className="max-w-[55%] text-sm text-white/70">
          {store.name}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t("catalog.openCart", {
            count: cartCount(cart.items),
          })}`}
          onPress={() =>
            router.push({
              pathname: "/cart/[storeSlug]",
              params: { storeSlug },
            })
          }
        >
          <Text className="font-semibold text-brand-pink">
            {t("catalog.cartCount", { count: cartCount(cart.items) })}
          </Text>
        </Pressable>
      </View>
      {product.images.length ? (
        <FlashList
          horizontal
          style={{ height: 320 }}
          data={product.images}
          keyExtractor={(uri, index) => `${uri}-${index}`}
          showsHorizontalScrollIndicator={false}
          renderItem={({ item }) => (
            <Image
              source={{ uri: item }}
              contentFit="cover"
              cachePolicy="memory-disk"
              style={{ width: 360, height: 320, backgroundColor: "#27242a" }}
            />
          )}
        />
      ) : (
        <View className="mx-5 h-72 items-center justify-center rounded-2xl bg-white/5">
          <Text className="text-white/50">{t("common.noImages")}</Text>
        </View>
      )}
      <View className="gap-5 px-5 pt-6">
        <View className="gap-2">
          <Text className="text-2xl font-bold text-white">{product.name}</Text>
          <Text className="text-2xl font-bold text-brand-pink">
            {formatPrice(product.price, product.currency, locale)}
          </Text>
          <Text
            className={`text-sm font-semibold ${
              unavailable ? "text-red-300" : "text-emerald-300"
            }`}
          >
            {product.discontinued
              ? t("common.discontinued")
              : product.soldOut
                ? t("common.outOfStock")
                : t("common.available")}
          </Text>
        </View>
        {product.description ? (
          <View className="gap-2">
            <Text className="text-lg font-semibold text-white">
              {t("catalog.description")}
            </Text>
            <Text className="leading-6 text-white/75">
              {product.description}
            </Text>
          </View>
        ) : null}
        {product.variants.length ? (
          <View className="gap-3">
            <Text className="text-lg font-semibold text-white">
              {t("catalog.variants")}
            </Text>
            {product.variants.map((variant) => (
              <VariantRow
                key={variant.id}
                basePrice={product.price}
                currency={product.currency}
                variant={variant}
                disabled={unavailable || cart.isSaving}
                onAdd={() =>
                  cart.add({
                    productId: product.id,
                    variantId: variant.id,
                    name: product.name,
                    variantLabel: variant.name,
                    image: variant.imageOverride ?? product.images[0],
                    price: Number(variant.priceOverride ?? product.price),
                    currency: product.currency,
                    quantity: 1,
                  })
                }
              />
            ))}
          </View>
        ) : null}
        {!product.variants.length ? (
          <Pressable
            accessibilityRole="button"
            disabled={unavailable || cart.isSaving}
            className={`rounded-xl px-5 py-4 ${
              unavailable ? "bg-white/15" : "bg-brand-pink"
            }`}
            onPress={() =>
              cart.add({
                productId: product.id,
                name: product.name,
                image: product.images[0],
                price: Number(product.price),
                currency: product.currency,
                quantity: 1,
              })
            }
          >
            <Text className="text-center font-bold text-brand-ink">
              {unavailable
                ? t("common.unavailable")
                : cart.isSaving
                  ? t("catalog.saving")
                  : t("catalog.addToCart")}
            </Text>
          </Pressable>
        ) : null}
        {cart.error ? (
          <Text
            accessibilityRole="alert"
            className="text-center text-sm text-red-200"
          >
            {t("cart.saveFailed")}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          className="rounded-xl bg-brand-pink px-5 py-3"
          onPress={() => router.push("/search")}
        >
          <Text className="text-center font-semibold text-brand-ink">
            {t("catalog.keepBrowsing")}
          </Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function VariantRow({
  currency,
  basePrice,
  variant,
  onAdd,
  disabled,
}: {
  currency: string;
  basePrice: string;
  variant: PublicProductVariantResponseDto;
  onAdd: () => void;
  disabled: boolean;
}) {
  const { locale, t } = useMobileI18n();
  const soldOut =
    disabled ||
    (variant.stock !== null && variant.stock - variant.reserved <= 0);
  const attributes = Object.entries(variant.attributes)
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" · ");
  const price = variant.priceOverride ?? basePrice;

  return (
    <View className="flex-row items-center gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
      {variant.imageOverride ? (
        <Image
          source={{ uri: variant.imageOverride }}
          contentFit="cover"
          cachePolicy="memory-disk"
          style={{ width: 52, height: 52, borderRadius: 12 }}
        />
      ) : null}
      <View className="flex-1 gap-1">
        <Text className="font-semibold text-white">{variant.name}</Text>
        {attributes ? (
          <Text className="text-xs text-white/60">{attributes}</Text>
        ) : null}
        <Text className="text-xs text-white/60">
          {variant.stock === null
            ? t("common.variableAvailability")
            : t("catalog.availableCount", {
                count: Math.max(variant.stock - variant.reserved, 0),
              })}
        </Text>
      </View>
      <View className="items-end gap-2">
        {price ? (
          <Text className="font-semibold text-brand-pink">
            {formatPrice(price, currency, locale)}
          </Text>
        ) : null}
        <Pressable
          accessibilityRole="button"
          disabled={soldOut}
          className={`rounded-lg px-3 py-2 ${
            soldOut ? "bg-white/15" : "bg-brand-pink"
          }`}
          onPress={onAdd}
        >
          <Text className="text-xs font-bold text-brand-ink">
            {t("catalog.add")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}
