"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { SUPPORTED_CURRENCIES } from "@biasmarket/utils/currency";
import { apiFetch } from "@/lib/api";
import { useStore } from "@/lib/use-store";

interface DeliveryMethod {
  type: "PICKUP" | "COURIER";
  enabled: boolean;
  details: Record<string, unknown>;
}

export default function SettingsPage() {
  const t = useTranslations("dashboard.settings");
  const tCommon = useTranslations("common");
  const { store, storeId, loading: storeLoading } = useStore();
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState<string>(SUPPORTED_CURRENCIES[0]);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [deliveryMethods, setDeliveryMethods] = useState<DeliveryMethod[]>([]);
  const [pickupEnabled, setPickupEnabled] = useState(false);
  const [pickupAddress, setPickupAddress] = useState("");
  const [courierEnabled, setCourierEnabled] = useState(false);
  const [courierCost, setCourierCost] = useState("");

  useEffect(() => {
    if (store?.whatsappNumber) setWhatsappNumber(store.whatsappNumber);
    if (store?.defaultCurrency) setDefaultCurrency(store.defaultCurrency);
  }, [store]);

  const loadDeliveryMethods = async () => {
    if (!storeId) return;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  const handleSaveWhatsapp = async () => {
    setLoading(true);
    setError(null);
    try {
      await apiFetch(`/stores/${storeId}`, {
        method: "PATCH",
        body: JSON.stringify({ whatsappNumber, defaultCurrency }),
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

  if (storeLoading) {
    return (
      <div className="min-h-screen bg-gray-50 px-6 py-10 text-sm text-gray-500">
        {tCommon("loading")}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="max-w-2xl mx-auto flex flex-col gap-6">
        <h1 className="text-2xl font-bold text-gray-900">{t("title")}</h1>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-3">
          <h2 className="font-semibold text-gray-900">{t("whatsappTitle")}</h2>
          <p className="text-sm text-gray-500">{t("whatsappHelp")}</p>
          <input
            placeholder={t("whatsappPlaceholder")}
            value={whatsappNumber}
            onChange={(e) => setWhatsappNumber(e.target.value)}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />

          <h2 className="font-semibold text-gray-900">{t("currencyTitle")}</h2>
          <p className="text-sm text-gray-500">{t("currencyHelp")}</p>
          <select
            value={defaultCurrency}
            onChange={(e) => setDefaultCurrency(e.target.value)}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600"
          >
            {SUPPORTED_CURRENCIES.map((currency) => (
              <option key={currency} value={currency}>
                {currency}
              </option>
            ))}
          </select>

          <button
            onClick={handleSaveWhatsapp}
            disabled={loading || !whatsappNumber}
            className="self-start rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600 disabled:opacity-60"
          >
            {saved ? t("saved") : loading ? t("saving") : t("save")}
          </button>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-3">
          <h2 className="font-semibold text-gray-900">{t("pickupTitle")}</h2>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={pickupEnabled}
              onChange={(e) => setPickupEnabled(e.target.checked)}
            />
            {t("enabled")}
          </label>
          <input
            placeholder={t("addressPlaceholder")}
            value={pickupAddress}
            onChange={(e) => setPickupAddress(e.target.value)}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
          <button
            onClick={handleSavePickup}
            className="self-start rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
          >
            {t("save")}
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 flex flex-col gap-3">
          <h2 className="font-semibold text-gray-900">{t("courierTitle")}</h2>
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={courierEnabled}
              onChange={(e) => setCourierEnabled(e.target.checked)}
            />
            {t("enabled")}
          </label>
          <input
            placeholder={t("costPlaceholder")}
            value={courierCost}
            onChange={(e) => setCourierCost(e.target.value)}
            className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-600 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
          />
          <button
            onClick={handleSaveCourier}
            className="self-start rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-600"
          >
            {t("save")}
          </button>
        </div>
      </div>
    </div>
  );
}
