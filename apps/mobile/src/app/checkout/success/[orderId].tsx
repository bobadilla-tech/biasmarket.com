import { Pressable, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";

export default function CheckoutSuccessScreen() {
  const { orderId, paymentStatus, proofSubmitted } = useLocalSearchParams<{
    orderId: string;
    paymentStatus: string;
    proofSubmitted: string;
  }>();
  const router = useRouter();

  return (
    <View className="flex-1 items-center justify-center gap-5 bg-brand-ink px-6">
      <Text className="text-center text-3xl font-bold text-brand-pink">
        Pedido enviado
      </Text>
      <Text className="text-center text-white/80">
        {proofSubmitted === "true"
          ? "Recibimos tu pedido y el comprobante quedó pendiente de revisión por la tienda."
          : paymentStatus === "PENDING_PAYMENT"
            ? "Recibimos tu pedido. Sigue las instrucciones de pago de la tienda."
            : "Recibimos tu pedido y la tienda podrá revisarlo desde su panel."}
      </Text>
      <Text className="text-sm text-white/50">Pedido: {orderId}</Text>
      <Pressable
        accessibilityRole="button"
        className="rounded-xl bg-brand-pink px-5 py-3"
        onPress={() => router.replace("/")}
      >
        <Text className="font-semibold text-brand-ink">Volver a descubrir</Text>
      </Pressable>
    </View>
  );
}
