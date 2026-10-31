import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { z } from "zod";
import { ApiError } from "@biasmarket/types";
import {
  customerLoginSchema,
  customerRegisterSchema,
} from "@biasmarket/validation";
import { useBuyerSession } from "../features/auth/session-context";
import { useMobileI18n } from "../i18n/mobile-i18n";

const registerFormSchema = customerRegisterSchema.extend({
  storeSlug: z.string().min(1),
  phone: customerLoginSchema.shape.phone,
  token: z.string().min(1),
});
type RegisterForm = z.infer<typeof registerFormSchema>;

export default function RegisterScreen() {
  const params = useLocalSearchParams<{ slug?: string; token?: string }>();
  const router = useRouter();
  const { t } = useMobileI18n();
  const { register, error: sessionError } = useBuyerSession();
  const [error, setError] = useState<string | null>(null);
  const token = Array.isArray(params.token) ? params.token[0] : params.token;
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      storeSlug: slug ?? "",
      phone: "",
      token: token ?? "",
      password: "",
      confirmPassword: "",
    },
  });

  const submit = handleSubmit(async (values) => {
    setError(null);
    try {
      await register(
        values.storeSlug.trim(),
        values.token.trim(),
        values.phone.trim(),
        values.password,
      );
      router.replace("/");
    } catch (cause) {
      if (
        cause instanceof Error &&
        cause.message === "auth.registrationCompleteSignInFailed"
      ) {
        router.replace({
          pathname: "/login",
          params: {
            slug: values.storeSlug.trim(),
            notice: "registration-complete",
          },
        });
        return;
      }
      if (cause instanceof ApiError && cause.status === 409) {
        router.replace({
          pathname: "/login",
          params: {
            slug: values.storeSlug.trim(),
            notice: "account-already-registered",
          },
        });
        return;
      }
      setError(t("auth.registerFailed"));
    }
  });

  return (
    <ScrollView
      contentContainerClassName="flex-grow justify-center gap-4 bg-brand-ink px-6 py-8"
      keyboardShouldPersistTaps="handled"
    >
      <Text className="text-3xl font-bold text-brand-pink">
        {t("auth.registerSetupTitle")}
      </Text>
      <Text className="text-sm text-white/80">
        {t("auth.registerSetupDescription")}
      </Text>
      <RegisterField
        control={control}
        name="storeSlug"
        label={t("auth.storeSlug")}
        error={errors.storeSlug?.message}
      />
      <RegisterField
        control={control}
        name="token"
        label={t("auth.inviteToken")}
        error={errors.token?.message}
      />
      <RegisterField
        control={control}
        name="phone"
        label={t("auth.accountPhone")}
        keyboardType="phone-pad"
        error={errors.phone?.message}
      />
      <RegisterField
        control={control}
        name="password"
        label={t("auth.passwordMin")}
        secureTextEntry
        error={errors.password?.message}
      />
      <RegisterField
        control={control}
        name="confirmPassword"
        label={t("auth.repeatPassword")}
        secureTextEntry
        error={errors.confirmPassword?.message}
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
          {isSubmitting ? t("auth.saving") : t("auth.registerButton")}
        </Text>
      </Pressable>
      <Link href="/login" className="text-center font-medium text-white">
        {t("auth.alreadyHavePassword")}
      </Link>
    </ScrollView>
  );
}

function RegisterField({
  control,
  name,
  label,
  error,
  secureTextEntry = false,
  keyboardType = "default",
}: {
  control: ReturnType<typeof useForm<RegisterForm>>["control"];
  name: keyof RegisterForm;
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
          {error
            ? t(
                error === "passwordsDontMatch"
                  ? "auth.passwordMismatch"
                  : "auth.requiredField",
              )
            : null}
        </Text>
      ) : null}
    </View>
  );
}
