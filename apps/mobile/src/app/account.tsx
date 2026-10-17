import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ApiError, customerAuth } from "@biasmarket/types";
import type { CustomerProfileResponseDto } from "@biasmarket/types";
import { useBuyerSession } from "../features/auth/session-context.js";
import { useMobileI18n } from "../i18n/mobile-i18n.js";

export default function HomeScreen() {
  const router = useRouter();
  const { locale, setLocale, t } = useMobileI18n();
  const { status, storeSlug, signOut, error: sessionError } = useBuyerSession();
  const [profile, setProfile] = useState<CustomerProfileResponseDto | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") router.replace("/login");
  }, [router, status]);

  useEffect(() => {
    if (status !== "authenticated" || !storeSlug) return;
    let active = true;

    void customerAuth
      .me(storeSlug)
      .then((data) => {
        if (active) setProfile(data);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof ApiError && cause.status === 401) return;
        setError(t("common.connectionError"));
      });

    return () => {
      active = false;
    };
  }, [status, storeSlug, t]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <View className="flex-1 items-center justify-center bg-brand-ink">
        <ActivityIndicator color="#f2b4c7" />
      </View>
    );
  }

  return (
    <View className="flex-1 justify-center gap-4 bg-brand-ink px-6">
      <Pressable accessibilityRole="button" onPress={() => router.replace("/")}>
        <Text className="font-semibold text-brand-pink">
          ‹ {t("common.backToDiscover")}
        </Text>
      </Pressable>
      <Text className="text-3xl font-bold text-brand-pink">{"t("common.brandName")}</Text>
      <Text className="text-lg text-white">
        {profile?.customer.name
          ? t("account.greeting", { name: profile.customer.name })
          : t("auth.activeBuyerSession")}
      </Text>
      <Text className="text-sm text-white/70">
        {t("checkout.storeLabel", { slug: storeSlug ?? "" })}
        {profile ? ` · ${profile.customer.phone}` : ""}
      </Text>
      <Pressable
        accessibilityRole="button"
        className="rounded-xl border border-white/15 px-5 py-3"
        onPress={() => router.push("/orders")}
      >
        <Text className="text-center font-semibold text-white">
          {t("orders.viewOrders")}
        </Text>
      </Pressable>
      {error || sessionError ? (
        <Text accessibilityRole="alert" className="text-sm text-red-300">
          {error || (sessionError ? t(sessionError) : null)}
        </Text>
      ) : null}
      <Text className="text-sm font-medium text-white">
        {t("account.language")}
      </Text>
      <View className="flex-row gap-3">
        {(["es", "en"] as const).map((option) => (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: locale === option }}
            className="rounded-xl border border-white/15 px-4 py-2"
            onPress={() => setLocale(option)}
          >
            <Text className="text-white">
              {t(option === "es" ? "common.spanish" : "common.english")}
            </Text>
          </Pressable>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        className="rounded-xl bg-brand-pink px-5 py-3"
        onPress={() => {
          void signOut()
            .then(() => router.replace("/login"))
            .catch(() => undefined);
        }}
      >
        <Text className="text-center font-semibold text-brand-ink">
          {t("auth.signOut")}
        </Text>
      </Pressable>
    </View>
  );
}
