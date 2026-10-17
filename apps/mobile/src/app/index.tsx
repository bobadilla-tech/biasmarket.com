import { useMemo, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";
import { useRouter } from "expo-router";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { productSearch, stores } from "@biasmarket/types";
import type {
  DirectoryStoreItemResponseDto,
  FeaturedStoreResponseDto,
  SearchProductResponseDto,
} from "@biasmarket/types";
import {
  FeaturedStoreCard,
  ProductCard,
  StoreRow,
} from "../features/catalog/catalog-ui";
import { useBuyerSession } from "../features/auth/session-context";

const directoryKey = ["catalog", "store-directory"] as const;
const EMPTY_FEATURED_STORES: FeaturedStoreResponseDto[] = [];
const EMPTY_DIRECTORY_STORES: DirectoryStoreItemResponseDto[] = [];

export default function DiscoverScreen() {
  const router = useRouter();
  const { status } = useBuyerSession();
  const [refreshing, setRefreshing] = useState(false);
  const featuredQuery = useQuery({
    queryKey: ["catalog", "featured-stores"],
    queryFn: () => stores.findFeatured({ limit: "8" }),
  });
  const directoryQuery = useInfiniteQuery({
    queryKey: directoryKey,
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      stores.findDirectory({ page: String(pageParam), limit: "24" }),
    getNextPageParam: (lastPage) =>
      lastPage.page * lastPage.limit < lastPage.total
        ? lastPage.page + 1
        : undefined,
  });
  const productsQuery = useQuery({
    queryKey: ["catalog", "latest-products"],
    queryFn: () => productsSearch(),
  });
  const featured = featuredQuery.data ?? EMPTY_FEATURED_STORES;
  const directory =
    directoryQuery.data?.pages.flatMap((page) => page.stores) ??
    EMPTY_DIRECTORY_STORES;
  const storesToShow = useMemo(() => {
    const seen = new Set(featured.map((store) => store.id));
    return directory.filter((store) => !seen.has(store.id));
  }, [directory, featured]);
  const isLoading =
    featuredQuery.isPending &&
    directoryQuery.isPending &&
    productsQuery.isPending;
  const error =
    featuredQuery.error ?? directoryQuery.error ?? productsQuery.error;

  async function refresh() {
    setRefreshing(true);
    try {
      await Promise.all([
        featuredQuery.refetch(),
        directoryQuery.refetch(),
        productsQuery.refetch(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }

  if (isLoading) {
    return <LoadingScreen />;
  }

  return (
    <View className="flex-1 bg-brand-ink">
      <FlashList
        contentContainerStyle={{ paddingBottom: 36 }}
        data={storesToShow}
        keyExtractor={(store) => store.id}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        onEndReached={() => {
          if (
            directoryQuery.hasNextPage &&
            !directoryQuery.isFetchingNextPage
          ) {
            void directoryQuery.fetchNextPage();
          }
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          directoryQuery.isFetchingNextPage ? (
            <ActivityIndicator className="py-5" color="#f2b4c7" />
          ) : null
        }
        ListHeaderComponent={
          <DiscoverHeader
            error={error instanceof Error ? error.message : null}
            featured={featured}
            products={productsQuery.data ?? []}
            onSearch={() => router.push("/search")}
            onAccount={() => router.push(status === "authenticated" ? "/account" : "/login")}
            onStore={(slug) =>
              router.push({ pathname: "/search", params: { storeSlug: slug } })
            }
            onProduct={(product) =>
              router.push({
                pathname: "/product/[storeSlug]/[productId]",
                params: {
                  storeSlug: product.store.slug,
                  productId: product.id,
                },
              })
            }
          />
        }
        ListEmptyComponent={
          <Text className="px-6 pb-8 text-sm text-white/70">
            Aún no hay más tiendas en el directorio.
          </Text>
        }
        renderItem={({ item }) => (
          <StoreRow
            store={item}
            onPress={() =>
              router.push({
                pathname: "/search",
                params: { storeSlug: item.slug },
              })
            }
          />
        )}
      />
    </View>
  );
}

async function productsSearch(): Promise<SearchProductResponseDto[]> {
  const result = await productSearch.search({ limit: "8", sort: "latest" });
  return result.products;
}

function DiscoverHeader({
  error,
  featured,
  products: featuredProducts,
  onSearch,
  onAccount,
  onStore,
  onProduct,
}: {
  error: string | null;
  featured: FeaturedStoreResponseDto[];
  products: SearchProductResponseDto[];
  onSearch: () => void;
  onAccount: () => void;
  onStore: (storeSlug: string) => void;
  onProduct: (product: SearchProductResponseDto) => void;
}) {
  return (
    <View className="gap-7 px-5 pt-12">
      <View className="flex-row items-center justify-between">
        <View>
          <Text className="text-sm font-semibold uppercase tracking-widest text-brand-pink">
            Bias Market
          </Text>
          <Text className="mt-1 text-3xl font-bold text-white">Descubre</Text>
        </View>
        <View className="flex-row gap-2">
          <Pressable
            accessibilityRole="button"
            className="rounded-xl bg-white/10 px-3 py-3"
            onPress={onAccount}
          >
            <Text className="font-semibold text-white">Cuenta</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            className="rounded-xl bg-brand-pink px-4 py-3"
            onPress={onSearch}
          >
            <Text className="font-semibold text-brand-ink">Buscar</Text>
          </Pressable>
        </View>
      </View>
      {error ? (
        <Text accessibilityRole="alert" className="text-sm text-red-300">
          No pudimos cargar el catálogo. Desliza hacia abajo para reintentar.
        </Text>
      ) : null}
      <View className="gap-3">
        <SectionTitle title="Tiendas destacadas" />
        {featured.length ? (
          <FlashList
            horizontal
            data={featured}
            keyExtractor={(store) => store.id}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <FeaturedStoreCard
                store={item}
                onPress={() => onStore(item.slug)}
              />
            )}
          />
        ) : (
          <Text className="text-sm text-white/60">
            Pronto habrá tiendas destacadas.
          </Text>
        )}
      </View>
      <View className="gap-3">
        <SectionTitle title="Recién publicados" />
        {featuredProducts.length ? (
          <FlashList
            horizontal
            data={featuredProducts}
            keyExtractor={(product) => product.id}
            showsHorizontalScrollIndicator={false}
            renderItem={({ item }) => (
              <View className="mr-3">
                <ProductCard product={item} onPress={() => onProduct(item)} />
              </View>
            )}
          />
        ) : (
          <Text className="text-sm text-white/60">
            No hay productos disponibles todavía.
          </Text>
        )}
      </View>
      <View className="gap-1 pt-1">
        <SectionTitle title="Directorio de tiendas" />
        <Text className="text-sm text-white/60">
          Explora las tiendas públicas de Bias Market.
        </Text>
      </View>
    </View>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <Text className="text-xl font-bold text-white">{title}</Text>;
}

function LoadingScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-brand-ink">
      <ActivityIndicator color="#f2b4c7" />
      <Text className="mt-3 text-sm text-white/70">Cargando tiendas...</Text>
    </View>
  );
}
