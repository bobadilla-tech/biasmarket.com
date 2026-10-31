import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { z } from "zod";
import {
  customerLoginSchema,
  type CustomerLoginInput,
} from "@biasmarket/validation";
import { useBuyerSession } from "../features/auth/session-context.js";
import { useMobileI18n } from "../i18n/mobile-i18n.js";

export default function LoginScreen() {
  const router = useRouter();
  const { returnTo, orderId, storeSlug } = useLocalSearchParams<{
    returnTo?: string;
    orderId?: string;
    storeSlug?: string;
  }>();
  const { t } = useMobileI18n();
  const { signIn, error: sessionError } = useBuyerSession();
  const [error, setError] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CustomerLoginInput & { storeSlug: string }>({
    resolver: zodResolver(
      customerLoginSchema.extend({ storeSlug: z.string().min(1) }),
    ),
    defaultValues: {
      storeSlug: typeof storeSlug === "string" ? storeSlug : "",
      phone: "",
      password: "",
    },
  });

  const submit = handleSubmit(async ({ storeSlug, phone, password }) => {
    setError(null);
    try {
      await signIn(storeSlug.trim(), phone.trim(), password);
      if (returnTo === "order-detail" && orderId) {
        router.replace({
          pathname: "/orders/[orderId]",
          params: { orderId, storeSlug: storeSlug.trim() },
        });
      } else if (returnTo === "orders") {
        router.replace("/orders");
      } else {
        router.replace("/");
      }
    } catch {
      setError(t("auth.loginFailed"));
    }
  });

  return (
    <ScrollView
      contentContainerClassName="flex-grow justify-center gap-4 bg-brand-ink px-6 py-8"
      keyboardShouldPersistTaps="handled"
    >
      <Text className="text-3xl font-bold text-brand-pink">
        {t("auth.loginTitle")}
      </Text>
      <Text className="text-sm text-white/80">
        {t("auth.loginAccountDescription")}
      </Text>
      <LoginField
        control={control}
        name="storeSlug"
        label={t("auth.storeSlug")}
        error={errors.storeSlug?.message}
      />
      <LoginField
        control={control}
        name="phone"
        label={t("auth.phone")}
        keyboardType="phone-pad"
        error={errors.phone?.message}
      />
      <LoginField
        control={control}
        name="password"
        label={t("auth.password")}
        secureTextEntry
        error={errors.password?.message}
      />
      {sessionError || error ? (
        <Text accessibilityRole="alert" className="text-sm text-red-300">
          {error || (sessionError ? t(sessionError) : null)}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={isSubmitting}
        className="rounded-xl bg-brand-pink px-5 py-3 disabled:opacity-50"
        onPress={() => void submit()}
      >
        <Text className="text-center font-semibold text-brand-ink">
          {isSubmitting ? t("auth.loggingIn") : t("auth.loginButton")}
        </Text>
      </Pressable>
      <Link href="/register" className="text-center font-medium text-white">
        {t("auth.signUpLink")}
      </Link>
    </ScrollView>
  );
}

function LoginField({
  control,
  name,
  label,
  error,
  secureTextEntry = false,
  keyboardType = "default",
}: {
  control: ReturnType<
    typeof useForm<CustomerLoginInput & { storeSlug: string }>
  >["control"];
  name: "storeSlug" | "phone" | "password";
  label: string;
  error?: string;
  secureTextEntry?: boolean;
  keyboardType?: "default" | "phone-pad";
}) {
  const { t } = useMobileI18n();
  return (
    <View className="gap-1">
      <Text className="text-sm font-medium text-white">{label}</Text>
      <Controller
        control={control}
        name={name}
        render={({ field: { onChange, onBlur, value } }) => (
          <TextInput
            accessibilityLabel={label}
            autoCapitalize="none"
            className="rounded-xl border border-white/20 bg-white px-4 py-3 text-brand-ink"
            keyboardType={keyboardType}
            onBlur={onBlur}
            onChangeText={onChange}
            secureTextEntry={secureTextEntry}
            value={value}
          />
        )}
      />
      {error ? (
        <Text accessibilityRole="alert" className="text-sm text-red-300">
          {error ? t("auth.requiredField") : null}
        </Text>
      ) : null}
    </View>
  );
}
