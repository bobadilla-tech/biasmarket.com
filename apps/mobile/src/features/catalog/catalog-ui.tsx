import { Image } from "expo-image";
import {
  Pressable,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import type {
  DirectoryStoreItemResponseDto,
  FeaturedStoreResponseDto,
  SearchProductResponseDto,
} from "@biasmarket/types";
import { useMobileI18n } from "../../i18n/mobile-i18n";

export function StoreImage({
  uri,
  size,
}: {
  uri: string | null;
  size: number;
}) {
  return uri ? (
    <Image
      source={{ uri }}
      contentFit="cover"
      cachePolicy="memory-disk"
      style={{ width: size, height: size, borderRadius: 14 }}
    />
  ) : (
    <View
      className="items-center justify-center rounded-2xl bg-white/10"
      style={{ width: size, height: size }}
    >
      <Text className="text-lg font-bold text-brand-pink">B</Text>
    </View>
  );
}

export function FeaturedStoreCard({
  store,
  onPress,
}: {
  store: FeaturedStoreResponseDto;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" className="mr-3" onPress={onPress}>
      <View className="w-64 flex-row items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-3">
        <StoreImage uri={store.logoUrl} size={52} />
        <View className="flex-1">
          <Text numberOfLines={1} className="font-semibold text-white">
            {store.name}
          </Text>
          <Text numberOfLines={1} className="text-sm text-white/60">
            @{store.slug}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export function StoreRow({
  store,
  onPress,
}: {
  store: DirectoryStoreItemResponseDto;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      className="mx-5 flex-row items-center gap-4 border-b border-white/10 py-4"
      onPress={onPress}
    >
      <StoreImage uri={store.logoUrl} size={52} />
      <View className="flex-1">
        <Text className="font-semibold text-white">{store.name}</Text>
        <Text className="text-sm text-white/60">@{store.slug}</Text>
      </View>
      <Text className="text-xl text-brand-pink">›</Text>
    </Pressable>
  );
}

export function ProductCard({
  product,
  onPress,
  style,
}: {
  product: SearchProductResponseDto;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  const { locale } = useMobileI18n();
  return (
    <Pressable
      accessibilityRole="button"
      className="w-44 overflow-hidden rounded-2xl border border-white/10 bg-white/5"
      style={style}
      onPress={onPress}
    >
      <Image
        source={product.images[0] ? { uri: product.images[0] } : undefined}
        contentFit="cover"
        cachePolicy="memory-disk"
        style={{ width: "100%", height: 132, backgroundColor: "#27242a" }}
      />
      <View className="gap-1 p-3">
        <Text numberOfLines={2} className="font-semibold text-white">
          {product.name}
        </Text>
        <Text numberOfLines={1} className="text-xs text-white/60">
          {product.store.name}
        </Text>
        <Text className="font-bold text-brand-pink">
          {formatPrice(product.price, product.currency, locale)}
        </Text>
      </View>
    </Pressable>
  );
}

export function formatPrice(
  value: string,
  currency: string,
  locale: "en" | "es" = "es",
): string {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return `${currency} ${value}`;
  try {
    return new Intl.NumberFormat(locale === "es" ? "es-PE" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
