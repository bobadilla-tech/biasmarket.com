import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, customerAuth, globalAccount } from "@biasmarket/types";
import type { CustomerProfileResponseDto } from "@biasmarket/types";
import { useBuyerSession } from "../features/auth/session-context";
import {
  clearBuyerCheckoutQueries,
  clearBuyerCheckoutState,
  isSessionEndedDeleteError,
} from "../features/auth/account-deletion";
import { useMobileI18n } from "../i18n/mobile-i18n";

export default function AccountScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { locale, setLocale, t } = useMobileI18n();
  const { status, storeSlug, signOut, error: sessionError } = useBuyerSession();
  const [deleting, setDeleting] = useState(false);
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

  const deleteAccount = () => {
    Alert.alert(t("account.deleteTitle"), t("account.deleteConfirmation"), [
      { text: t("common.back"), style: "cancel" },
      {
        text: t("account.deleteAction"),
        style: "destructive",
        onPress: () => {
          setDeleting(true);
          void globalAccount
            .deleteMe()
            .then(async () => {
              try {
                await clearBuyerCheckoutState();
              } catch {
                console.warn(
                  "Could not clear local checkout data after deletion.",
                );
              }
              clearBuyerCheckoutQueries(queryClient);
              try {
                await signOut();
              } catch {
                // Ignore local sign-out failure since account is already deleted remotely.
              }
              router.replace("/login");
            })
            .catch((cause: unknown) => {
              setDeleting(false);
              if (isSessionEndedDeleteError(cause)) {
                Alert.alert(
                  t("account.sessionEndedTitle"),
                  t("account.sessionEnded"),
                );
                router.replace("/login");
                return;
              }
              Alert.alert(
                t("account.deleteFailedTitle"),
                t("account.deleteFailed"),
              );
            });
        },
      },
    ]);
  };

  return (
    <View className="flex-1 justify-center gap-4 bg-brand-ink px-6">
      <Pressable accessibilityRole="button" onPress={() => router.back()}>
        <Text className="font-semibold text-brand-pink">
          ‹ {t("common.back")}
        </Text>
      </Pressable>
      <Text className="text-3xl font-bold text-brand-pink">
        {t("common.brandName")}
      </Text>
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
          {t("auth.myOrders")}
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
        onPress={() =>
          void signOut()
            .then(() => router.replace("/login"))
            .catch(() => undefined)
        }
      >
        <Text className="text-center font-semibold text-brand-ink">
          {t("auth.signOut")}
        </Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: deleting }}
        disabled={deleting}
        className="rounded-xl border border-red-300/40 px-5 py-3"
        onPress={deleteAccount}
      >
        <Text className="text-center font-semibold text-red-200">
          {deleting ? t("account.deleting") : t("account.deleteAction")}
        </Text>
      </Pressable>
    </View>
  );
}
