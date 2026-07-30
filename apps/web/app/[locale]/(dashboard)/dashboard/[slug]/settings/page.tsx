"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Building2,
  CreditCard,
  Copy,
  Palette,
  Pipette,
  Plus,
  Store,
  Truck,
  Upload,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { SUPPORTED_CURRENCIES } from "@biasmarket/utils/currency";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import {
  buildCustomStorePalette,
  buildStoreThemeConfig,
  resolveStorePalette,
  STORE_PALETTES,
} from "@/lib/store-theme";
import { broadcastStoreUpdate, useStore } from "@/lib/use-store";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { StoreLogo } from "@/components/store-logo";

interface DeliveryMethod {
  type: "PICKUP" | "COURIER";
  enabled: boolean;
  details: Record<string, unknown>;
}

interface PickupPoint {
  id: string;
  label: string;
  enabled: boolean;
  sortOrder: number;
}

const isNewPickupPoint = (id: string) => id.startsWith("new:");

interface NotificationSetting {
  key: "newOrder" | "paymentReview" | "orderDelivered" | "weeklySummary";
  enabled: boolean;
  locked?: boolean;
}

const PAYMENT_METHODS = [
  { key: "yape", method: "YAPE", color: "bg-[#f8ddf2] text-[#bd2d84]" },
  { key: "plin", method: "PLIN", color: "bg-[#ece0ff] text-[#7540d9]" },
  { key: "transfer", method: "TRANSFER", color: "bg-[#e4f5ff] text-[#2472ae]" },
  { key: "cash", method: "CASH", color: "bg-[#ebf9ef] text-[#27965e]" },
] as const;

function SectionCard({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="rounded-[28px] border-[#eadcf7] bg-white py-0 shadow-sm">
      <CardHeader className="px-6 pt-6">
        <div className="flex items-start gap-3">
          <div className="store-theme-icon-surface flex size-11 items-center justify-center rounded-2xl">
            <Icon className="size-5" />
          </div>
          <div>
            <CardTitle className="text-lg text-[#2d1649]">{title}</CardTitle>
            <CardDescription className="mt-1 text-sm text-[#8f7da8]">
              {description}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-6 pb-6">{children}</CardContent>
    </Card>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2">
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#927fac]">
        {label}
      </span>
      {children}
    </label>
  );
}

function ToggleRow({
  label,
  description,
  enabled,
  onChange,
  disabled = false,
}: {
  label: string;
  description?: string;
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-[#f0e7f8] bg-[#fcf9ff] px-4 py-3">
      <div>
        <p className="text-sm font-medium text-[#341b55]">{label}</p>
        {description ? <p className="text-xs text-[#9582ad]">{description}</p> : null}
      </div>
      <Switch
        checked={enabled}
        onCheckedChange={onChange}
        disabled={disabled}
        className="data-[checked]:bg-transparent"
        style={
          enabled
            ? {
                background:
                  "linear-gradient(135deg, var(--store-accent) 0%, var(--store-primary) 100%)",
              }
            : undefined
        }
      />
    </div>
  );
}

export default function SettingsPage() {
  const t = useTranslations("dashboard.settings");
  const tCommon = useTranslations("common");
  const { locale, slug } = useParams<{ locale: string; slug: string }>();
  const { store, storeId, loading: storeLoading } = useStore();

  const [storeName, setStoreName] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [paymentInstructions, setPaymentInstructions] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState<string>(SUPPORTED_CURRENCIES[0]);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [selectedPaletteId, setSelectedPaletteId] = useState(STORE_PALETTES[0].id);
  const [customColor, setCustomColor] = useState("#6d28d9");

  const [pickupEnabled, setPickupEnabled] = useState(false);
  const [pickupPoints, setPickupPoints] = useState<PickupPoint[]>([]);
  const [newPointLabel, setNewPointLabel] = useState("");
  const [deletedPointIds, setDeletedPointIds] = useState<string[]>([]);
  const [courierEnabled, setCourierEnabled] = useState(false);
  const [courierCost, setCourierCost] = useState("");

  const [paymentMethodsEnabled, setPaymentMethodsEnabled] = useState<Record<string, boolean>>({
    YAPE: true,
    PLIN: true,
    TRANSFER: true,
    CASH: true,
  });

  const [profileSaving, setProfileSaving] = useState(false);
  const [appearanceSaving, setAppearanceSaving] = useState(false);
  const [deliverySaving, setDeliverySaving] = useState(false);
  const [notificationsSaving, setNotificationsSaving] = useState(false);
  const [paymentMethodsSaving, setPaymentMethodsSaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [savedSection, setSavedSection] = useState<
    "profile" | "appearance" | "delivery" | "notifications" | "payments" | null
  >(null);
  const [error, setError] = useState<string | null>(null);

  const [lowStockAlertsEnabled, setLowStockAlertsEnabled] = useState(true);
  const [lowStockThreshold, setLowStockThreshold] = useState("5");

  const [notifications, setNotifications] = useState<NotificationSetting[]>([
    { key: "newOrder", enabled: true },
    { key: "paymentReview", enabled: true },
    { key: "orderDelivered", enabled: false, locked: true },
    { key: "weeklySummary", enabled: false, locked: true },
  ]);

  useEffect(() => {
    if (!store) return;
    setStoreName(store.name ?? "");
    setWhatsappNumber(store.whatsappNumber ?? "");
    setDefaultCurrency(store.defaultCurrency ?? SUPPORTED_CURRENCIES[0]);
    setPaymentInstructions(store.paymentInstructions ?? "");
    setLogoUrl(store.logoUrl ?? null);
    setLowStockAlertsEnabled(store.lowStockAlertsEnabled ?? true);
    setLowStockThreshold(String(store.lowStockThreshold ?? 5));
    const resolved = resolveStorePalette(store.themeConfig);
    const isPreset = STORE_PALETTES.some((palette) => palette.id === resolved.id);
    setSelectedPaletteId(isPreset ? resolved.id : "custom");
    if (!isPreset) setCustomColor(resolved.colors.primary);
  }, [store]);

  const loadDeliveryMethods = async () => {
    if (!storeId) return;
    const [methods, points] = await Promise.all([
      apiFetch(`/stores/${storeId}/delivery-methods`),
      apiFetch(`/stores/${storeId}/pickup-points`),
    ]);
    const pickup = (methods as DeliveryMethod[]).find((method) => method.type === "PICKUP");
    const courier = (methods as DeliveryMethod[]).find((method) => method.type === "COURIER");

    setPickupEnabled(pickup?.enabled ?? false);
    setPickupPoints(points as PickupPoint[]);
    setDeletedPointIds([]);
    setCourierEnabled(courier?.enabled ?? false);
    setCourierCost(String(courier?.details?.estimatedCost ?? ""));
  };

  const loadPaymentMethods = async () => {
    if (!storeId) return;
    const methods = await apiFetch(`/stores/${storeId}/payment-methods`);
    const next: Record<string, boolean> = { YAPE: true, PLIN: true, TRANSFER: true, CASH: true };
    for (const row of methods as { method: string; enabled: boolean }[]) {
      next[row.method] = row.enabled;
    }
    setPaymentMethodsEnabled(next);
  };

  const handleTogglePaymentMethod = (method: string, enabled: boolean) => {
    setPaymentMethodsEnabled((prev) => ({ ...prev, [method]: enabled }));
  };

  const handleSavePaymentMethods = async () => {
    if (!storeId) return;
    setPaymentMethodsSaving(true);
    setError(null);
    try {
      await Promise.all(
        PAYMENT_METHODS.map((method) =>
          apiFetch(`/stores/${storeId}/payment-methods`, {
            method: "POST",
            body: JSON.stringify({
              method: method.method,
              enabled: paymentMethodsEnabled[method.method] ?? true,
            }),
          }),
        ),
      );
      setSavedSection("payments");
      await loadPaymentMethods();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPaymentMethodsSaving(false);
    }
  };

  const handleAddPoint = () => {
    if (!newPointLabel.trim()) return;
    setPickupPoints((prev) => [
      ...prev,
      { id: `new:${Date.now()}`, label: newPointLabel.trim(), enabled: true, sortOrder: prev.length },
    ]);
    setNewPointLabel("");
  };

  const handleRemovePoint = (id: string) => {
    setPickupPoints((prev) => prev.filter((point) => point.id !== id));
    if (!isNewPickupPoint(id)) {
      setDeletedPointIds((prev) => [...prev, id]);
    }
  };

  const handleTogglePoint = (id: string, enabled: boolean) => {
    setPickupPoints((prev) => prev.map((point) => (point.id === id ? { ...point, enabled } : point)));
  };

  const handleUpdatePointLabel = (id: string, label: string) => {
    setPickupPoints((prev) => prev.map((point) => (point.id === id ? { ...point, label } : point)));
  };

  useEffect(() => {
    loadDeliveryMethods().catch(() => undefined);
    loadPaymentMethods().catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  useEffect(() => {
    if (!savedSection) return;
    const timer = window.setTimeout(() => setSavedSection(null), 1800);
    return () => window.clearTimeout(timer);
  }, [savedSection]);

  const storefrontUrl = useMemo(() => {
    if (typeof window === "undefined") {
      return `/${locale}/store/${slug}`;
    }

    return `${window.location.origin}/${locale}/store/${slug}`;
  }, [locale, slug]);

  const selectedPalette = useMemo(() => {
    if (selectedPaletteId === "custom") return buildCustomStorePalette(customColor);
    return STORE_PALETTES.find((palette) => palette.id === selectedPaletteId) ?? STORE_PALETTES[0];
  }, [selectedPaletteId, customColor]);

  const handleSaveProfile = async () => {
    if (!storeId) return;
    setProfileSaving(true);
    setError(null);

    try {
      await apiFetch(`/stores/${storeId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: storeName,
          whatsappNumber,
          paymentInstructions,
          defaultCurrency,
        }),
      });
      broadcastStoreUpdate({
        slug,
        store: {
          name: storeName,
          whatsappNumber,
          paymentInstructions,
          defaultCurrency,
        },
      });
      setSavedSection("profile");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSaveAppearance = async () => {
    if (!storeId) return;
    setAppearanceSaving(true);
    setError(null);

    try {
      const themeConfig = buildStoreThemeConfig(selectedPalette);
      await apiFetch(`/stores/${storeId}`, {
        method: "PATCH",
        body: JSON.stringify({ themeConfig }),
      });
      broadcastStoreUpdate({
        slug,
        store: { themeConfig },
      });
      setSavedSection("appearance");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAppearanceSaving(false);
    }
  };

  const handleSaveDelivery = async () => {
    if (!storeId) return;
    setDeliverySaving(true);
    setError(null);

    try {
      await Promise.all([
        apiFetch(`/stores/${storeId}/delivery-methods`, {
          method: "POST",
          body: JSON.stringify({
            type: "PICKUP",
            enabled: pickupEnabled,
            details: {},
          }),
        }),
        apiFetch(`/stores/${storeId}/delivery-methods`, {
          method: "POST",
          body: JSON.stringify({
            type: "COURIER",
            enabled: courierEnabled,
            details: { estimatedCost: Number(courierCost || 0) },
          }),
        }),
        ...pickupPoints
          .filter((point) => isNewPickupPoint(point.id))
          .map((point) =>
            apiFetch(`/stores/${storeId}/pickup-points`, {
              method: "POST",
              body: JSON.stringify({
                label: point.label,
                enabled: point.enabled,
                sortOrder: point.sortOrder,
              }),
            }),
          ),
        ...pickupPoints
          .filter((point) => !isNewPickupPoint(point.id))
          .map((point) =>
            apiFetch(`/stores/${storeId}/pickup-points/${point.id}`, {
              method: "PATCH",
              body: JSON.stringify({
                label: point.label,
                enabled: point.enabled,
                sortOrder: point.sortOrder,
              }),
            }),
          ),
        ...deletedPointIds.map((id) =>
          apiFetch(`/stores/${storeId}/pickup-points/${id}`, { method: "DELETE" }),
        ),
      ]);
      setSavedSection("delivery");
      await loadDeliveryMethods();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeliverySaving(false);
    }
  };

  const handleSaveNotifications = async () => {
    if (!storeId) return;
    setNotificationsSaving(true);
    setError(null);

    try {
      const threshold = Math.max(0, Number(lowStockThreshold) || 0);
      await apiFetch(`/stores/${storeId}`, {
        method: "PATCH",
        body: JSON.stringify({
          lowStockAlertsEnabled,
          lowStockThreshold: threshold,
        }),
      });
      broadcastStoreUpdate({
        slug,
        store: { lowStockAlertsEnabled, lowStockThreshold: threshold },
      });
      setSavedSection("notifications");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setNotificationsSaving(false);
    }
  };

  const handleUploadLogo = async (file: File | null) => {
    if (!file || !storeId) return;
    setLogoUploading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/stores/${storeId}/logo`,
        {
          method: "POST",
          credentials: "include",
          body: formData,
        },
      );
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        throw new Error(data?.message ?? tCommon("networkError"));
      }

      setLogoUrl(data.logoUrl ?? null);
      broadcastStoreUpdate({
        slug,
        store: { logoUrl: data.logoUrl ?? null },
      });
      setSavedSection("profile");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLogoUploading(false);
    }
  };

  if (storeLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-sm text-[#8f7da8]">
        {tCommon("loading")}
      </div>
    );
  }

  return (
    <div className="min-h-screen px-5 py-6 lg:px-8 lg:py-8">
      <div className="space-y-6">
        <Card className="rounded-[28px] border-white/60 bg-white/55 py-0 shadow-[0_10px_35px_rgba(89,35,126,0.05)] backdrop-blur">
          <CardContent className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-[#8e7ca7]">
                {t("eyebrow")}
              </p>
              <h1 className="text-3xl font-bold tracking-tight text-[#2d1649]">
                {t("title")}
              </h1>
              <p className="mt-1 text-sm text-[#8f7da8]">{t("subtitle")}</p>
            </div>
            <div className="flex items-center gap-3">
              <Input
                value={t("searchPlaceholder")}
                readOnly
                className="hidden min-w-[250px] rounded-2xl border-[#eadcf7] bg-white text-[#a18eb8] shadow-none sm:flex"
              />
              <StoreLogo
                name={storeName}
                logoUrl={logoUrl}
                size={48}
                className="text-sm font-semibold"
                style={{ boxShadow: "0 10px 30px var(--store-shadow)" }}
              />
            </div>
          </CardContent>
        </Card>

        {error ? (
          <Card className="rounded-2xl border-[#f3cbd8] bg-[#fff3f7] py-0 shadow-none">
            <CardContent className="px-4 py-3 text-sm text-[#b24368]">
              {error}
            </CardContent>
          </Card>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
          <div className="space-y-6">
            <SectionCard
              icon={Store}
              title={t("profile.title")}
              description={t("profile.description")}
            >
              <div
                className="mb-6 flex flex-col gap-4 rounded-[24px] p-4 sm:flex-row sm:items-center sm:justify-between"
                style={{ backgroundColor: "var(--store-surface)" }}
              >
                <div className="flex items-center gap-4">
                  <StoreLogo
                    name={storeName}
                    logoUrl={logoUrl}
                    size={72}
                    className="rounded-[22px] text-xl font-black"
                    style={{ boxShadow: "0 18px 36px var(--store-shadow)" }}
                  />
                  <div>
                    <p className="text-lg font-semibold text-[#2d1649]">
                      {storeName || t("emptyName")}
                    </p>
                    <p className="text-sm text-[#8f7da8]">{storefrontUrl}</p>
                  </div>
                </div>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg"
                  className="hidden"
                  onChange={(event) =>
                    handleUploadLogo(event.target.files?.[0] ?? null)
                  }
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => logoInputRef.current?.click()}
                  className="store-theme-secondary-button h-11 rounded-2xl border bg-white px-4 text-sm font-semibold shadow-none"
                >
                  <Upload className="size-4" />
                  {logoUploading ? t("profile.uploading") : t("profile.upload")}
                </Button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={t("profile.nameLabel")}>
                  <Input
                    value={storeName}
                    onChange={(event) => setStoreName(event.target.value)}
                    className="store-theme-input h-12 rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] text-[#341b55] shadow-none"
                  />
                </Field>
                <Field label={t("profile.urlLabel")}>
                  <Input
                    value={storefrontUrl}
                    readOnly
                    className="h-12 rounded-2xl border-[#ede2f6] bg-[#f5effb] text-[#8d7ba7] shadow-none"
                  />
                </Field>
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,1fr)_180px]">
                <Field label={t("profile.whatsappLabel")}>
                  <PhoneInput
                    value={whatsappNumber}
                    onChange={setWhatsappNumber}
                    placeholder={t("profile.whatsappPlaceholder")}
                    selectClassName="store-theme-input h-12 rounded-2xl border border-[#e7dcf3] bg-[#fbf8fe] text-sm text-[#341b55] outline-none"
                    inputClassName="store-theme-input h-12 rounded-2xl border border-[#e7dcf3] bg-[#fbf8fe] px-4 text-[#341b55] outline-none"
                  />
                </Field>
                <Field label={t("profile.currencyLabel")}>
                  <Select
                    value={defaultCurrency}
                    onChange={(event) => setDefaultCurrency(event.target.value)}
                    className="h-12 w-full"
                    selectClassName="store-theme-input h-full rounded-2xl border border-[#e7dcf3] bg-[#fbf8fe] text-sm text-[#341b55] outline-none"
                  >
                    {SUPPORTED_CURRENCIES.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="mt-4">
                <Field label={t("profile.instructionsLabel")}>
                  <Textarea
                    value={paymentInstructions}
                    onChange={(event) =>
                      setPaymentInstructions(event.target.value)
                    }
                    placeholder={t("profile.instructionsPlaceholder")}
                    rows={4}
                    className="store-theme-input rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] text-[#341b55] shadow-none"
                  />
                </Field>
              </div>

              <Separator className="my-5 bg-[#f0e7f8]" />

              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-[#8f7da8]">{t("profile.help")}</p>
                <Button
                  onClick={handleSaveProfile}
                  disabled={profileSaving || !storeName || !whatsappNumber}
                  className="store-theme-primary-button h-11 rounded-2xl px-5 text-sm font-semibold hover:scale-[1.01] hover:opacity-100"
                >
                  {savedSection === "profile"
                    ? t("saved")
                    : profileSaving
                      ? t("saving")
                      : t("save")}
                </Button>
              </div>
            </SectionCard>

            <SectionCard
              icon={Palette}
              title={t("appearance.title")}
              description={t("appearance.description")}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                {STORE_PALETTES.map((palette) => (
                  <Button
                    key={palette.id}
                    type="button"
                    variant="outline"
                    onClick={() => setSelectedPaletteId(palette.id)}
                    className={cn(
                      "h-auto flex-col items-stretch rounded-[22px] p-4 text-left shadow-none",
                      selectedPaletteId === palette.id
                        ? "bg-white shadow-sm"
                        : "bg-[#fcf9ff] hover:bg-white",
                    )}
                    style={{
                      borderColor:
                        selectedPaletteId === palette.id
                          ? "var(--store-primary)"
                          : "#eadcf8",
                    }}
                  >
                    <div className="mb-3 flex w-full gap-2">
                      {Object.values(palette.colors).map((color) => (
                        <span
                          key={color}
                          className="h-8 flex-1 rounded-full"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <div className="flex w-full items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[#301848]">
                          {palette.name}
                        </p>
                        <p className="mt-1 text-xs text-[#8d79a5]">
                          {palette.description}
                        </p>
                      </div>
                      {selectedPaletteId === palette.id ? (
                        <Badge className="store-theme-soft-badge rounded-full px-2.5 py-1 text-[11px] font-semibold">
                          {t("appearance.selected")}
                        </Badge>
                      ) : null}
                    </div>
                  </Button>
                ))}

                <Popover>
                  <PopoverTrigger
                    type="button"
                    onClick={() => setSelectedPaletteId("custom")}
                    className={cn(
                      "h-auto flex-col items-stretch rounded-[22px] border p-4 text-left shadow-none",
                      selectedPaletteId === "custom"
                        ? "bg-white shadow-sm"
                        : "bg-[#fcf9ff] hover:bg-white",
                    )}
                    style={{
                      borderColor: selectedPaletteId === "custom" ? "var(--store-primary)" : "#eadcf8",
                    }}
                  >
                    <div className="mb-3 flex w-full gap-2">
                      {selectedPaletteId === "custom" ? (
                        Object.values(selectedPalette.colors).map((color) => (
                          <span
                            key={color}
                            className="h-8 flex-1 rounded-full"
                            style={{ backgroundColor: color }}
                          />
                        ))
                      ) : (
                        <div className="flex h-8 flex-1 items-center justify-center rounded-full border-2 border-dashed border-[#c9b3e8] text-[#7a38d8]">
                          <Pipette className="size-4" />
                        </div>
                      )}
                    </div>
                    <div className="flex w-full items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[#301848]">
                          {t("appearance.customLabel")}
                        </p>
                        <p className="mt-1 text-xs text-[#8d79a5]">
                          {t("appearance.customDescription")}
                        </p>
                      </div>
                      {selectedPaletteId === "custom" ? (
                        <Badge className="store-theme-soft-badge rounded-full px-2.5 py-1 text-[11px] font-semibold">
                          {t("appearance.selected")}
                        </Badge>
                      ) : null}
                    </div>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto">
                    <p className="mb-3 text-sm font-semibold text-[#301848]">
                      {t("appearance.customColorLabel")}
                    </p>
                    <input
                      type="color"
                      value={customColor}
                      onChange={(event) => {
                        setCustomColor(event.target.value);
                        setSelectedPaletteId("custom");
                      }}
                      className="h-10 w-full cursor-pointer rounded-lg border border-[#eadcf8]"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <Card
                className="mt-5 rounded-[24px] py-0 shadow-none ring-0"
                style={{ backgroundColor: selectedPalette.colors.surface }}
              >
                <CardContent className="px-4 py-4">
                  <p
                    className="text-sm font-semibold"
                    style={{ color: selectedPalette.colors.text }}
                  >
                    {t("appearance.previewTitle")}
                  </p>
                  <div className="mt-3 flex items-center gap-4">
                    <StoreLogo
                      name={storeName}
                      size={56}
                      className="text-sm font-black"
                      gradient={{ from: selectedPalette.colors.accent, to: selectedPalette.colors.primary }}
                    />
                    <div className="flex-1">
                      <Button
                        type="button"
                        className="h-11 w-full rounded-2xl text-sm font-semibold hover:opacity-100"
                        style={{
                          background: `linear-gradient(135deg, ${selectedPalette.colors.accent} 0%, ${selectedPalette.colors.primary} 100%)`,
                        }}
                      >
                        {t("appearance.previewButton")}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Separator className="my-5 bg-[#f0e7f8]" />

              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-[#8f7da8]">{t("appearance.help")}</p>
                <Button
                  onClick={handleSaveAppearance}
                  disabled={appearanceSaving}
                  className="store-theme-primary-button h-11 rounded-2xl px-5 text-sm font-semibold hover:scale-[1.01] hover:opacity-100"
                >
                  {savedSection === "appearance"
                    ? t("saved")
                    : appearanceSaving
                      ? t("saving")
                      : t("appearance.apply")}
                </Button>
              </div>
            </SectionCard>

            <SectionCard
              icon={CreditCard}
              title={t("payments.title")}
              description={t("payments.description")}
            >
              <div className="space-y-3">
                {PAYMENT_METHODS.map((method) => (
                  <div
                    key={method.key}
                    className="flex items-center justify-between rounded-2xl border border-[#f0e7f8] bg-[#fcf9ff] px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <Badge
                        className={cn(
                          "rounded-2xl px-2.5 py-1.5 text-xs font-semibold",
                          method.color,
                        )}
                      >
                        {t(`payments.items.${method.key}.short`)}
                      </Badge>
                      <div>
                        <p className="text-sm font-medium text-[#341b55]">
                          {t(`payments.items.${method.key}.label`)}
                        </p>
                        <p className="text-xs text-[#9582ad]">
                          {t(`payments.items.${method.key}.description`)}
                        </p>
                      </div>
                    </div>
                    <Switch
                      checked={paymentMethodsEnabled[method.method] ?? true}
                      onCheckedChange={(checked) => handleTogglePaymentMethod(method.method, checked)}
                    />
                  </div>
                ))}
              </div>

              <Separator className="my-5 bg-[#f0e7f8]" />

              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-[#8f7da8]">{t("payments.footer")}</p>
                <Button
                  onClick={handleSavePaymentMethods}
                  disabled={paymentMethodsSaving}
                  className="store-theme-primary-button h-11 rounded-2xl px-5 text-sm font-semibold hover:opacity-100"
                >
                  {savedSection === "payments"
                    ? t("saved")
                    : paymentMethodsSaving
                      ? t("saving")
                      : t("save")}
                </Button>
              </div>
            </SectionCard>
          </div>

          <div className="space-y-6">
            <SectionCard
              icon={Truck}
              title={t("delivery.title")}
              description={t("delivery.description")}
            >
              <div className="space-y-4">
                <ToggleRow
                  label={t("delivery.pickupToggle")}
                  description={t("delivery.pickupHelp")}
                  enabled={pickupEnabled}
                  onChange={setPickupEnabled}
                />

                <div className="block space-y-2">
                  <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#927fac]">
                    {t("delivery.pickupPointsLabel")}
                  </span>
                  <div className="space-y-2">
                    {pickupPoints.length === 0 ? (
                      <p className="text-xs text-[#9582ad]">
                        {t("delivery.noPickupPoints")}
                      </p>
                    ) : (
                      pickupPoints.map((point) => (
                        <div
                          key={point.id}
                          className="flex items-center gap-3 rounded-2xl border border-[#f0e7f8] bg-[#fcf9ff] px-4 py-3"
                        >
                          <Switch
                            checked={point.enabled}
                            onCheckedChange={(enabled) =>
                              handleTogglePoint(point.id, enabled)
                            }
                          />
                          <Input
                            value={point.label}
                            onChange={(event) =>
                              handleUpdatePointLabel(
                                point.id,
                                event.target.value,
                              )
                            }
                            className="store-theme-input h-10 rounded-xl border-[#e7dcf3] bg-white text-[#341b55] shadow-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemovePoint(point.id)}
                            className="text-lg leading-none text-(--store-primary)"
                            aria-label={t("delivery.removePickupPoint")}
                          >
                            ×
                          </button>
                        </div>
                      ))
                    )}
                    <div className="flex gap-2">
                      <Input
                        value={newPointLabel}
                        onChange={(event) =>
                          setNewPointLabel(event.target.value)
                        }
                        placeholder={t("delivery.pickupPointPlaceholder")}
                        className="store-theme-input h-11 rounded-2xl border-[#e7dcf3] bg-white text-[#341b55] shadow-none"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleAddPoint}
                        className="store-theme-secondary-button h-11 shrink-0 rounded-2xl border bg-white px-4 text-sm font-semibold shadow-none"
                      >
                        <Plus className="size-4" />
                        {t("delivery.addPickupPoint")}
                      </Button>
                    </div>
                  </div>
                </div>

                <ToggleRow
                  label={t("delivery.courierToggle")}
                  description={t("delivery.courierHelp")}
                  enabled={courierEnabled}
                  onChange={setCourierEnabled}
                />

                <Field label={t("delivery.courierCostLabel")}>
                  <Input
                    value={courierCost}
                    onChange={(event) => setCourierCost(event.target.value)}
                    placeholder={t("delivery.courierCostPlaceholder")}
                    className="store-theme-input h-12 rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] text-[#341b55] shadow-none"
                  />
                </Field>
              </div>

              <Separator className="my-5 bg-[#f0e7f8]" />

              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-[#8f7da8]">{t("delivery.footer")}</p>
                <Button
                  onClick={handleSaveDelivery}
                  disabled={deliverySaving}
                  variant="outline"
                  className="store-theme-secondary-button h-11 rounded-2xl border px-5 text-sm font-semibold shadow-none"
                >
                  {savedSection === "delivery"
                    ? t("saved")
                    : deliverySaving
                      ? t("saving")
                      : t("save")}
                </Button>
              </div>
            </SectionCard>

            <SectionCard
              icon={Building2}
              title={t("defaults.title")}
              description={t("defaults.description")}
            >
              <div className="space-y-3">
                <Card className="rounded-2xl border-[#f0e7f8] bg-[#fcf9ff] py-0 shadow-none">
                  <CardContent className="px-4 py-3">
                    <p className="text-sm font-medium text-[#341b55]">
                      {t("defaults.currencyCardTitle")}
                    </p>
                    <p className="mt-1 text-xs text-[#9582ad]">
                      {t("defaults.currencyCardDescription")}
                    </p>
                    <Badge className="store-theme-soft-badge mt-3 rounded-full px-3 py-1 text-xs font-semibold">
                      {defaultCurrency}
                    </Badge>
                  </CardContent>
                </Card>
                <Card className="rounded-2xl border-[#f0e7f8] bg-[#fcf9ff] py-0 shadow-none">
                  <CardContent className="px-4 py-3">
                    <p className="text-sm font-medium text-[#341b55]">
                      {t("defaults.urlCardTitle")}
                    </p>

                    <p className="mt-1 text-xs text-[#9582ad]">
                      {t("defaults.urlCardDescription")}
                    </p>

                    <div className="mt-3 flex items-center justify-between gap-3">
                      <p className="store-theme-active-text truncate text-sm font-medium">
                        {storefrontUrl}
                      </p>

                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8 shrink-0 rounded-lg border-[#e5d8f5] hover:bg-[#f5effd]"
                        onClick={async () => {
                          await navigator.clipboard.writeText(storefrontUrl);
                          toast.success(t("defaults.copyMessage"));
                        }}
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </SectionCard>

            <SectionCard
              icon={Bell}
              title={t("notifications.title")}
              description={t("notifications.description")}
            >
              <div className="space-y-3">
                <ToggleRow
                  label={t("notifications.items.lowStock.label")}
                  description={t("notifications.items.lowStock.description")}
                  enabled={lowStockAlertsEnabled}
                  onChange={setLowStockAlertsEnabled}
                />
                {lowStockAlertsEnabled ? (
                  <Field label={t("notifications.thresholdLabel")}>
                    <Input
                      type="number"
                      min={0}
                      value={lowStockThreshold}
                      onChange={(event) => setLowStockThreshold(event.target.value)}
                      className="store-theme-input h-11 w-32 rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] text-[#341b55] shadow-none"
                    />
                  </Field>
                ) : null}

                {notifications.map((notification) => (
                  <ToggleRow
                    key={notification.key}
                    label={t(`notifications.items.${notification.key}.label`)}
                    description={t(
                      `notifications.items.${notification.key}.description`,
                    )}
                    enabled={notification.enabled}
                    disabled={notification.locked}
                    onChange={(enabled) =>
                      setNotifications((current) =>
                        current.map((item) =>
                          item.key === notification.key
                            ? { ...item, enabled }
                            : item,
                        ),
                      )
                    }
                  />
                ))}
              </div>

              <Separator className="my-5 bg-[#f0e7f8]" />

              <div className="flex items-center justify-end gap-4">
                <Button
                  onClick={handleSaveNotifications}
                  disabled={notificationsSaving}
                  className="store-theme-primary-button h-11 rounded-2xl px-5 text-sm font-semibold hover:scale-[1.01] hover:opacity-100"
                >
                  {savedSection === "notifications"
                    ? t("saved")
                    : notificationsSaving
                      ? t("saving")
                      : t("save")}
                </Button>
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}
