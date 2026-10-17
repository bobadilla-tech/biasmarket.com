import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { ApiError, customerAuth } from "@biasmarket/types";
import type { CustomerProfileResponseDto } from "@biasmarket/types";
import { useBuyerSession } from "../features/auth/session-context";

export default function AccountScreen() {
  const router = useRouter();
  const { status, storeSlug, signOut } = useBuyerSession();
  const [profile, setProfile] = useState<CustomerProfileResponseDto | null>(null);
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
        setError(cause instanceof Error ? cause.message : "Error de conexión.");
      });
    return () => {
      active = false;
    };
  }, [status, storeSlug]);

  if (status === "loading" || status === "unauthenticated") {
    return (
      <View className="flex-1 items-center justify-center bg-brand-ink">
        <ActivityIndicator color="#f2b4c7" />
      </View>
    );
  }

  return (
    <View className="flex-1 justify-center gap-4 bg-brand-ink px-6">
      <Pressable accessibilityRole="button" onPress={() => router.back()}>
        <Text className="font-semibold text-brand-pink">‹ Volver</Text>
      </Pressable>
      <Text className="text-3xl font-bold text-brand-pink">Bias Market</Text>
      <Text className="text-lg text-white">
        {profile?.customer.name
          ? `Hola, ${profile.customer.name}`
          : "Sesión de comprador activa"}
      </Text>
      <Text className="text-sm text-white/70">
        Tienda: {storeSlug}{profile ? ` · ${profile.customer.phone}` : ""}
      </Text>
      {error ? (
        <Text accessibilityRole="alert" className="text-sm text-red-300">
          {error}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        className="rounded-xl bg-brand-pink px-5 py-3"
        onPress={() => void signOut().then(() => router.replace("/login"))}
      >
        <Text className="text-center font-semibold text-brand-ink">Cerrar sesión</Text>
      </Pressable>
    </View>
  );
}
