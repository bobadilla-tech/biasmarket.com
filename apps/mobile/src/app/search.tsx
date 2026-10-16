import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { productSearch, stores } from "@biasmarket/types";
import type { SearchProductResponseDto } from "@biasmarket/types";
import { ProductCard } from "../features/catalog/catalog-ui";
import {
  flattenProductPages,
  nextProductSearchPage,
} from "../features/catalog/pagination";

const PAGE_SIZE = 24;

export default function SearchScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ storeSlug?: string }>();
  const routeStoreSlug = Array.isArray(params.storeSlug)
    ? params.storeSlug[0]
    : params.storeSlug;
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [storeSlug, setStoreSlug] = useState(routeStoreSlug ?? "");
  const [category, setCategory] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const directoryQuery = useQuery({
    queryKey: ["catalog", "category-stores"],
    queryFn: () => stores.findDirectory({ page: "1", limit: "50" }),
  });
  const categoryQuery = useQuery({
    queryKey: ["catalog", "categories", storeSlug],
    queryFn: () => stores.findCategoriesPublic(storeSlug),
    enabled: Boolean(storeSlug),
  });
  const resultQuery = useInfiniteQuery({
    queryKey: ["catalog", "product-search", debouncedQuery, category],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      productSearch.search({
        q: debouncedQuery || undefined,
        category: category || undefined,
        page: String(pageParam),
        limit: String(PAGE_SIZE),
      }),
    getNextPageParam: nextProductSearchPage,
  });
  const results = resultQuery.data
    ? flattenProductPages(resultQuery.data.pages)
    : [];
  const directory = directoryQuery.data?.stores ?? [];
  const categories = categoryQuery.data ?? [];

  function chooseStore(slug: string) {
    setStoreSlug(slug);
    setCategory("");
  }

  return (
    <View className="flex-1 bg-brand-ink">
      <View className="gap-4 px-5 pb-4 pt-12">
        <View className="flex-row items-center justify-between">
          <View>
            <Text className="text-sm font-semibold uppercase tracking-widest text-brand-pink">
              Catálogo
            </Text>
            <Text className="mt-1 text-3xl font-bold text-white">Buscar</Text>
          </View>
          <Pressable accessibilityRole="button" onPress={() => router.back()}>
            <Text className="font-semibold text-brand-pink">Volver</Text>
          </Pressable>
        </View>
        <TextInput
          accessibilityLabel="Buscar productos"
          autoCapitalize="none"
          className="rounded-xl border border-white/15 bg-white px-4 py-3 text-brand-ink"
          onChangeText={setQuery}
          placeholder="¿Qué estás buscando?"
          placeholderTextColor="#7b747c"
          returnKeyType="search"
          value={query}
        />
        <View className="gap-2">
          <Text className="text-sm font-semibold text-white">
            Categorías de una tienda
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              {directory.map((store) => (
                <FilterChip
                  key={store.id}
                  label={store.name}
                  selected={storeSlug === store.slug}
                  onPress={() => chooseStore(store.slug)}
                />
              ))}
            </View>
          </ScrollView>
          {storeSlug ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View className="flex-row gap-2">
                <FilterChip
                  label="Todas"
                  selected={!category}
                  onPress={() => setCategory("")}
                />
                {categories.map((item) => (
                  <FilterChip
                    key={item.id}
                    label={item.name}
                    selected={category === item.name}
                    onPress={() => setCategory(item.name)}
                  />
                ))}
              </View>
            </ScrollView>
          ) : (
            <Text className="text-xs text-white/50">
              Elige una tienda para ver sus categorías.
            </Text>
          )}
        </View>
        {categoryQuery.isPending && storeSlug ? (
          <ActivityIndicator color="#f2b4c7" />
        ) : null}
        {resultQuery.error ? (
          <Text accessibilityRole="alert" className="text-sm text-red-300">
            No se pudieron cargar los productos. Intenta de nuevo.
          </Text>
        ) : null}
      </View>
      <FlashList
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28 }}
        data={results}
        keyExtractor={(product) => product.id}
        numColumns={2}
        onEndReached={() => {
          if (resultQuery.hasNextPage && !resultQuery.isFetchingNextPage) {
            void resultQuery.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          resultQuery.isPending ? (
            <ActivityIndicator className="mt-10" color="#f2b4c7" />
          ) : (
            <Text className="mt-8 text-center text-sm text-white/60">
              No encontramos productos con esos filtros.
            </Text>
          )
        }
        ListFooterComponent={
          resultQuery.isFetchingNextPage ? (
            <ActivityIndicator className="py-5" color="#f2b4c7" />
          ) : null
        }
        renderItem={({ item }) => (
          <View className="mb-3 flex-1 px-1.5">
            <ProductCard
              product={item}
              style={{ width: "100%", marginRight: 0 }}
              onPress={() =>
                router.push({
                  pathname: "/product/[storeSlug]/[productId]",
                  params: { storeSlug: item.store.slug, productId: item.id },
                })
              }
            />
          </View>
        )}
      />
    </View>
  );
}

function FilterChip({
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
      accessibilityRole="button"
      accessibilityState={{ selected }}
      className={`rounded-full px-3 py-2 ${selected ? "bg-brand-pink" : "bg-white/10"}`}
      onPress={onPress}
    >
      <Text
        className={`text-xs font-semibold ${selected ? "text-brand-ink" : "text-white"}`}
      >
        {label}
      </Text>
    </Pressable>
  );
}
