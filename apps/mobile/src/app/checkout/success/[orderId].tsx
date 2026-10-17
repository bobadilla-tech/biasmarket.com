import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useMobileI18n } from "../../../i18n/mobile-i18n.js";

export default function CheckoutSuccessScreen() {
  const { orderId, paymentStatus, proofSubmitted } = useLocalSearchParams<{
    orderId: string;
    paymentStatus: string;
    proofSubmitted: string;
  }>();
  const router = useRouter();
  const { t } = useMobileI18n();

  return (
    <View className="flex-1 items-center justify-center gap-5 bg-brand-ink px-6">
      <Text className="text-center text-3xl font-bold text-brand-pink">
        {t("checkout.orderSuccessTitle")}
      </Text>
      <Text className="text-center text-white/80">
        {proofSubmitted === "true"
          ? t("checkout.orderReceivedProofPending")
          : paymentStatus === "PENDING_PAYMENT"
            ? t("checkout.orderReceivedPaymentPending")
            : t("checkout.orderReceived")}
      </Text>
      <Text className="text-sm text-white/50">
        {t("checkout.orderNumber", { id: orderId })}
      </Text>
      <Pressable
        accessibilityRole="button"
        className="rounded-xl border border-white/20 px-5 py-3"
        onPress={() =>
          router.push({ pathname: "/orders/[orderId]", params: { orderId } })
        }
      >
        <Text className="font-semibold text-white">Ver mi pedido</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        className="rounded-xl bg-brand-pink px-5 py-3"
        onPress={() => router.replace("/")}
      >
        <Text className="font-semibold text-brand-ink">
          {t("checkout.backToDiscover")}
        </Text>
      </Pressable>
    </View>
  );
}
