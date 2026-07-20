"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

interface DeliveryMethod {
  type: "PICKUP" | "COURIER";
  enabled: boolean;
  details: Record<string, unknown>;
}

export default function SettingsPage() {
  const { storeId } = useParams<{ storeId: string }>();
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [deliveryMethods, setDeliveryMethods] = useState<DeliveryMethod[]>([]);
  const [pickupEnabled, setPickupEnabled] = useState(false);
  const [pickupAddress, setPickupAddress] = useState("");
  const [courierEnabled, setCourierEnabled] = useState(false);
  const [courierCost, setCourierCost] = useState("");

  const loadDeliveryMethods = async () => {
    const methods = await apiFetch(`/stores/${storeId}/delivery-methods`);
    setDeliveryMethods(methods);
    const pickup = methods.find((m: DeliveryMethod) => m.type === "PICKUP");
    const courier = methods.find((m: DeliveryMethod) => m.type === "COURIER");
    setPickupEnabled(pickup?.enabled ?? false);
    setPickupAddress((pickup?.details?.address as string) ?? "");
    setCourierEnabled(courier?.enabled ?? false);
    setCourierCost((courier?.details?.estimatedCost as string)?.toString() ?? "");
  };

  useEffect(() => {
    loadDeliveryMethods();
  }, [storeId]);

  const handleSaveWhatsapp = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/stores/${storeId}`, {
        method: "PATCH",
        body: JSON.stringify({ whatsappNumber }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const handleSavePickup = async () => {
    await apiFetch(`/stores/${storeId}/delivery-methods`, {
      method: "POST",
      body: JSON.stringify({
        type: "PICKUP",
        enabled: pickupEnabled,
        details: { address: pickupAddress },
      }),
    });
    await loadDeliveryMethods();
  };

  const handleSaveCourier = async () => {
    await apiFetch(`/stores/${storeId}/delivery-methods`, {
      method: "POST",
      body: JSON.stringify({
        type: "COURIER",
        enabled: courierEnabled,
        details: { estimatedCost: Number(courierCost || 0) },
      }),
    });
    await loadDeliveryMethods();
  };

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-3">
          <h2 className="font-semibold text-gray-900">WhatsApp de la tienda</h2>
          <p className="text-sm text-gray-500">
            Los pedidos redirigen al comprador a este número con el detalle del pedido.
          </p>
          <input
            placeholder="+51999999999"
            value={whatsappNumber}
            onChange={(e) => setWhatsappNumber(e.target.value)}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
          <button
            onClick={handleSaveWhatsapp}
            disabled={loading || !whatsappNumber}
            className="self-start rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
          >
            {saved ? "Guardado ✓" : loading ? "Guardando..." : "Guardar"}
          </button>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-3">
          <h2 className="font-semibold text-gray-900">Retiro en tienda</h2>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={pickupEnabled}
              onChange={(e) => setPickupEnabled(e.target.checked)}
            />
            Habilitado
          </label>
          <input
            placeholder="Dirección de retiro"
            value={pickupAddress}
            onChange={(e) => setPickupAddress(e.target.value)}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
          <button
            onClick={handleSavePickup}
            className="self-start rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
          >
            Guardar
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-3">
          <h2 className="font-semibold text-gray-900">Envío por courier</h2>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={courierEnabled}
              onChange={(e) => setCourierEnabled(e.target.checked)}
            />
            Habilitado
          </label>
          <input
            placeholder="Costo estimado"
            value={courierCost}
            onChange={(e) => setCourierCost(e.target.value)}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
          <button
            onClick={handleSaveCourier}
            className="self-start rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
          >
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}
