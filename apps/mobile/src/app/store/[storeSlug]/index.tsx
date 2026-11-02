import { Redirect, useLocalSearchParams } from "expo-router";

export default function StoreDeepLink() {
  const { storeSlug } = useLocalSearchParams<{ storeSlug: string }>();
  return <Redirect href={{ pathname: "/search", params: { storeSlug } }} />;
}
