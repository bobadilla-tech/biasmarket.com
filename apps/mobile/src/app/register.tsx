import { zodResolver } from "@hookform/resolvers/zod";
import { Link, useLocalSearchParams, useRouter } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { z } from "zod";
import {
  customerLoginSchema,
  customerRegisterSchema,
} from "@biasmarket/validation";
import { useBuyerSession } from "../features/auth/session-context";

const registerFormSchema = customerRegisterSchema.extend({
  storeSlug: z.string().min(1),
  phone: customerLoginSchema.shape.phone,
  token: z.string().min(1),
});
type RegisterForm = z.infer<typeof registerFormSchema>;

export default function RegisterScreen() {
  const params = useLocalSearchParams<{ slug?: string; token?: string; returnTo?: string }>();
  const router = useRouter();
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
      if (params.returnTo === "checkout") {
        router.replace({ pathname: "/checkout/[storeSlug]", params: { storeSlug: values.storeSlug.trim() } });
      } else {
        router.replace("/");
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudo completar el registro.",
      );
    }
  });

  return (
    <ScrollView
      contentContainerClassName="flex-grow justify-center gap-4 bg-brand-ink px-6 py-8"
      keyboardShouldPersistTaps="handled"
    >
      <Text className="text-3xl font-bold text-brand-pink">
        Configurar cuenta
      </Text>
      <Text className="text-sm text-white/80">
        Usa el enlace de confirmación recibido y el teléfono de la cuenta. Al
        guardar la contraseña iniciaremos tu sesión.
      </Text>
      <RegisterField
        control={control}
        name="storeSlug"
        label="Slug de la tienda"
        error={errors.storeSlug?.message}
      />
      <RegisterField
        control={control}
        name="token"
        label="Token del enlace"
        error={errors.token?.message}
      />
      <RegisterField
        control={control}
        name="phone"
        label="Teléfono de la cuenta"
        keyboardType="phone-pad"
        error={errors.phone?.message}
      />
      <RegisterField
        control={control}
        name="password"
        label="Contraseña (mínimo 8 caracteres)"
        secureTextEntry
        error={errors.password?.message}
      />
      <RegisterField
        control={control}
        name="confirmPassword"
        label="Repetir contraseña"
        secureTextEntry
        error={errors.confirmPassword?.message}
      />
      {sessionError || error ? (
        <Text accessibilityRole="alert" className="text-sm text-red-300">
          {sessionError || error}
        </Text>
      ) : null}
      <Pressable
        accessibilityRole="button"
        disabled={isSubmitting}
        className="rounded-xl bg-brand-pink px-5 py-3 disabled:opacity-50"
        onPress={() => void submit()}
      >
        <Text className="text-center font-semibold text-brand-ink">
          {isSubmitting ? "Guardando…" : "Crear cuenta"}
        </Text>
      </Pressable>
      <Link
        href={{
          pathname: "/login",
          params: { storeSlug: slug, returnTo: params.returnTo },
        }}
        className="text-center font-medium text-white"
      >
        Ya tengo contraseña
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
          {error}
        </Text>
      ) : null}
    </View>
  );
}
