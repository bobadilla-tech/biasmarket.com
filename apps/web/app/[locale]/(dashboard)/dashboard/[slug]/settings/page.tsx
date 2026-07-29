"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  Building2,
  CreditCard,
  Palette,
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
import { Select } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { apiFetch } from "@/lib/api";
import {
  buildStoreThemeConfig,
  resolveStorePalette,
  STORE_PALETTES,
} from "@/lib/store-theme";
import { broadcastStoreUpdate, useStore } from "@/lib/use-store";
import { cn } from "@/lib/utils";

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
  key: "newOrder" | "paymentReview" | "lowStock" | "orderDelivered" | "weeklySummary";
  enabled: boolean;
  locked?: boolean;
}

const PAYMENT_METHODS = [
  { key: "yape", color: "bg-[#f8ddf2] text-[#bd2d84]" },
  { key: "plin", color: "bg-[#ece0ff] text-[#7540d9]" },
  { key: "transfer", color: "bg-[#e4f5ff] text-[#2472ae]" },
  { key: "cash", color: "bg-[#ebf9ef] text-[#27965e]" },
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

  const [pickupEnabled, setPickupEnabled] = useState(false);
  const [pickupPoints, setPickupPoints] = useState<PickupPoint[]>([]);
  const [newPointLabel, setNewPointLabel] = useState("");
  const [deletedPointIds, setDeletedPointIds] = useState<string[]>([]);
  const [courierEnabled, setCourierEnabled] = useState(false);
  const [courierCost, setCourierCost] = useState("");

  const [profileSaving, setProfileSaving] = useState(false);
  const [appearanceSaving, setAppearanceSaving] = useState(false);
  const [deliverySaving, setDeliverySaving] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);
  const [savedSection, setSavedSection] = useState<"profile" | "appearance" | "delivery" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [notifications, setNotifications] = useState<NotificationSetting[]>([
    { key: "newOrder", enabled: true },
    { key: "paymentReview", enabled: true },
    { key: "lowStock", enabled: true },
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
    setSelectedPaletteId(resolveStorePalette(store.themeConfig).id);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId]);

  useEffect(() => {
    if (!savedSection) return;
    const timer = window.setTimeout(() => setSavedSection(null), 1800);
    return () => window.clearTimeout(timer);
  }, [savedSection]);

  const storefrontUrl = useMemo(() => `/${locale}/store/${slug}`, [locale, slug]);

  const selectedPalette = useMemo(
    () =>
      STORE_PALETTES.find((palette) => palette.id === selectedPaletteId) ??
      STORE_PALETTES[0],
    [selectedPaletteId],
  );

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
              <p className="text-sm font-medium text-[#8e7ca7]">{t("eyebrow")}</p>
              <h1 className="text-3xl font-bold tracking-tight text-[#2d1649]">{t("title")}</h1>
              <p className="mt-1 text-sm text-[#8f7da8]">{t("subtitle")}</p>
            </div>
            <div className="flex items-center gap-3">
              <Input
                value={t("searchPlaceholder")}
                readOnly
                className="hidden min-w-[250px] rounded-2xl border-[#eadcf7] bg-white text-[#a18eb8] shadow-none sm:flex"
              />
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={storeName || "Store logo"}
                  className="size-12 rounded-2xl object-cover shadow-[0_10px_30px_var(--store-shadow)]"
                />
              ) : (
                <div
                  className="flex size-12 items-center justify-center rounded-2xl text-sm font-semibold text-white"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--store-accent) 0%, var(--store-primary) 100%)",
                    boxShadow: "0 10px 30px var(--store-shadow)",
                  }}
                >
                  {(storeName || "BM").slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {error ? (
          <Card className="rounded-2xl border-[#f3cbd8] bg-[#fff3f7] py-0 shadow-none">
            <CardContent className="px-4 py-3 text-sm text-[#b24368]">{error}</CardContent>
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
                  {logoUrl ? (
                    <img
                      src={logoUrl}
                      alt={storeName || "Store logo"}
                      className="size-[72px] rounded-[22px] object-cover shadow-sm"
                    />
                  ) : (
                    <div
                      className="flex size-[72px] items-center justify-center rounded-[22px] text-xl font-black text-white"
                      style={{
                        background:
                          "linear-gradient(135deg, var(--store-accent) 0%, var(--store-primary) 100%)",
                        boxShadow: "0 18px 36px var(--store-shadow)",
                      }}
                    >
                      {(storeName || "BM").slice(0, 2).toUpperCase()}
                    </div>
                  )}
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
                  onChange={(event) => handleUploadLogo(event.target.files?.[0] ?? null)}
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
                    onChange={(event) => setPaymentInstructions(event.target.value)}
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
                        <p className="font-semibold text-[#301848]">{palette.name}</p>
                        <p className="mt-1 text-xs text-[#8d79a5]">{palette.description}</p>
                      </div>
                      {selectedPaletteId === palette.id ? (
                        <Badge className="store-theme-soft-badge rounded-full px-2.5 py-1 text-[11px] font-semibold">
                          {t("appearance.selected")}
                        </Badge>
                      ) : null}
                    </div>
                  </Button>
                ))}
              </div>

              <Card
                className="mt-5 rounded-[24px] py-0 shadow-none ring-0"
                style={{ backgroundColor: selectedPalette.colors.surface }}
              >
                <CardContent className="px-4 py-4">
                  <p className="text-sm font-semibold" style={{ color: selectedPalette.colors.text }}>
                    {t("appearance.previewTitle")}
                  </p>
                  <div className="mt-3 flex items-center gap-4">
                    <div
                      className="flex size-14 items-center justify-center rounded-2xl text-sm font-black text-white"
                      style={{
                        background: `linear-gradient(135deg, ${selectedPalette.colors.accent} 0%, ${selectedPalette.colors.primary} 100%)`,
                      }}
                    >
                      {(storeName || "BM").slice(0, 2).toUpperCase()}
                    </div>
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
                      <Badge className={cn("rounded-2xl px-2.5 py-1.5 text-xs font-semibold", method.color)}>
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
                    <Badge
                      variant="outline"
                      className="rounded-full border-[#eadcf7] bg-white px-2.5 py-1 text-[11px] uppercase tracking-wide text-[#8e7ca7]"
                    >
                      {t("payments.manual")}
                    </Badge>
                  </div>
                ))}
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

                <Field label={t("delivery.pickupPointsLabel")}>
                  <div className="space-y-2">
                    {pickupPoints.length === 0 ? (
                      <p className="text-xs text-[#9582ad]">{t("delivery.noPickupPoints")}</p>
                    ) : (
                      pickupPoints.map((point) => (
                        <div
                          key={point.id}
                          className="flex items-center gap-3 rounded-2xl border border-[#f0e7f8] bg-[#fcf9ff] px-4 py-3"
                        >
                          <Switch
                            checked={point.enabled}
                            onCheckedChange={(enabled) => handleTogglePoint(point.id, enabled)}
                          />
                          <Input
                            value={point.label}
                            onChange={(event) => handleUpdatePointLabel(point.id, event.target.value)}
                            className="store-theme-input h-10 rounded-xl border-[#e7dcf3] bg-white text-[#341b55] shadow-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleRemovePoint(point.id)}
                            className="text-lg leading-none text-[var(--store-primary)]"
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
                        onChange={(event) => setNewPointLabel(event.target.value)}
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
                </Field>

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
                    <p className="store-theme-active-text mt-3 text-sm font-medium">
                      {storefrontUrl}
                    </p>
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
                {notifications.map((notification) => (
                  <ToggleRow
                    key={notification.key}
                    label={t(`notifications.items.${notification.key}.label`)}
                    description={t(`notifications.items.${notification.key}.description`)}
                    enabled={notification.enabled}
                    disabled={notification.locked}
                    onChange={(enabled) =>
                      setNotifications((current) =>
                        current.map((item) =>
                          item.key === notification.key ? { ...item, enabled } : item,
                        ),
                      )
                    }
                  />
                ))}
              </div>
            </SectionCard>
          </div>
        </div>
      </div>
    </div>
  );
}
