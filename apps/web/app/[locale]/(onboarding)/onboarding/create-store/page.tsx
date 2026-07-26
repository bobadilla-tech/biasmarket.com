"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  ImagePlus,
  Palette,
  Phone,
  Store,
  WandSparkles,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { SUPPORTED_CURRENCIES } from "@biasmarket/utils/currency";
import { useRouter } from "@/i18n/navigation";
import { buildStoreThemeConfig, STORE_PALETTES } from "@/lib/store-theme";
import { cn } from "@/lib/utils";

interface StoreSummary {
  id: string;
  name: string;
  slug: string;
}

function slugifyValue(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function Field({
  label,
  help,
  children,
}: {
  label: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-2.5">
      <div className="space-y-1">
        <p className="text-sm font-semibold text-[#301848]">{label}</p>
        {help ? <p className="text-xs text-[#8d79a5]">{help}</p> : null}
      </div>
      {children}
    </label>
  );
}

export default function CreateStorePage() {
  const t = useTranslations("onboarding.createStore");
  const tCommon = useTranslations("common");
  const router = useRouter();

  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [loadingStores, setLoadingStores] = useState(true);

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [defaultCurrency, setDefaultCurrency] = useState<string>(SUPPORTED_CURRENCIES[0]);
  const [selectedPaletteId, setSelectedPaletteId] = useState(STORE_PALETTES[0].id);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const selectedPalette = useMemo(
    () =>
      STORE_PALETTES.find((palette) => palette.id === selectedPaletteId) ??
      STORE_PALETTES[0],
    [selectedPaletteId],
  );

  useEffect(() => {
    const loadStores = async () => {
      try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/me/stores`, {
          credentials: "include",
        });
        const data = await res.json();
        if (res.ok) setStores(data);
      } finally {
        setLoadingStores(false);
      }
    };

    loadStores();
  }, []);

  useEffect(() => {
    if (!slugTouched) {
      setSlug(slugifyValue(name));
    }
  }, [name, slugTouched]);

  useEffect(() => {
    if (!logoFile) {
      setLogoPreviewUrl(null);
      return;
    }

    const nextUrl = URL.createObjectURL(logoFile);
    setLogoPreviewUrl(nextUrl);

    return () => URL.revokeObjectURL(nextUrl);
  }, [logoFile]);

  const handleCreate = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/stores`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          name,
          slug,
          whatsappNumber,
          defaultCurrency,
            themeConfig: buildStoreThemeConfig(selectedPalette.id),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        setError(data.message ?? t("genericError"));
        return;
      }

      setStores((prev) => [...prev, data]);

      if (logoFile) {
        const formData = new FormData();
        formData.append("file", logoFile);

        const logoRes = await fetch(
          `${process.env.NEXT_PUBLIC_API_URL}/api/stores/${data.id}/logo`,
          {
            method: "POST",
            credentials: "include",
            body: formData,
          },
        );

        if (!logoRes.ok) {
          setError(t("logoUploadingError"));
          return;
        }
      }

      setName("");
      setSlug("");
      setSlugTouched(false);
      setWhatsappNumber("");
      setLogoFile(null);
      setSelectedPaletteId(STORE_PALETTES[0].id);
      router.push(`/dashboard/${data.slug}/settings`);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteStore = async (storeId: string) => {
    if (!confirm(t("confirmDelete"))) return;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/stores/${storeId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        alert(data?.message ?? t("deleteError"));
        return;
      }
      setStores((prev) => prev.filter((store) => store.id !== storeId));
    } catch {
      alert(t("networkDeleteError"));
    }
  };

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(167,139,250,0.2),transparent_28%),linear-gradient(180deg,#f7f0ff_0%,#fdfbff_100%)] px-4 py-8 md:px-6">
      <div className="mx-auto grid max-w-7xl gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-[30px] border border-white/70 bg-[#2a0d50] p-5 text-white shadow-[0_22px_65px_rgba(67,24,109,0.22)]">
          <div className="rounded-[24px] border border-white/10 bg-white/6 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.26em] text-white/45">
              Bias Market
            </p>
            <h1 className="mt-3 text-2xl font-bold">{t("storesTitle")}</h1>
            <p className="mt-2 text-sm text-white/65">{t("storesDescription")}</p>
          </div>

          <div className="mt-5 space-y-3">
            {loadingStores ? (
              <p className="text-sm text-white/70">{tCommon("loading")}</p>
            ) : null}

            {!loadingStores && stores.length === 0 ? (
              <div className="rounded-[22px] border border-dashed border-white/14 bg-white/5 p-4 text-sm text-white/68">
                {t("empty")}
              </div>
            ) : null}

            {stores.map((store) => (
              <div
                key={store.id}
                className="rounded-[22px] border border-white/10 bg-white/6 p-4 transition hover:bg-white/10"
              >
                <button
                  onClick={() => router.push(`/dashboard/${store.slug}/settings`)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <div>
                    <p className="font-semibold text-white">{store.name}</p>
                    <p className="mt-1 text-xs text-white/50">/{store.slug}</p>
                  </div>
                  <ChevronRight className="size-4 text-white/45" />
                </button>
                <button
                  onClick={() => handleDeleteStore(store.id)}
                  className="mt-3 text-xs font-semibold text-[#ff9bc7] transition hover:text-white"
                >
                  {t("delete")}
                </button>
              </div>
            ))}
          </div>
        </aside>

        <section className="rounded-[34px] border border-[#efe5fb] bg-white/86 p-6 shadow-[0_24px_80px_rgba(120,74,170,0.08)] backdrop-blur md:p-8">
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_360px]">
            <div className="space-y-8">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-[#f3e8ff] px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.2em] text-[#7a38d8]">
                  <WandSparkles className="size-3.5" />
                  {t("createNew")}
                </div>
                <h2 className="mt-4 text-3xl font-bold tracking-tight text-[#2c1647]">
                  {t("title")}
                </h2>
                <p className="mt-2 max-w-2xl text-sm text-[#8d79a5]">{t("subtitle")}</p>
              </div>

              <div className="grid gap-8 lg:grid-cols-2">
                <div className="space-y-5">
                  <Field label={t("namePlaceholder")} help={t("nameHelp")}>
                    <div className="relative">
                      <Store className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#a38dbc]" />
                      <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        placeholder={t("namePlaceholder")}
                        className="w-full rounded-[20px] border border-[#e7daf6] bg-[#fcf9ff] py-3 pl-11 pr-4 text-sm text-[#311948] outline-none transition focus:border-[#b388eb] focus:bg-white"
                      />
                    </div>
                  </Field>

                  <Field label={t("slugLabel")} help={t("slugHelp")}>
                    <input
                      value={slug}
                      onChange={(event) => {
                        setSlugTouched(true);
                        setSlug(slugifyValue(event.target.value));
                      }}
                      placeholder={t("slugPlaceholder")}
                      className="w-full rounded-[20px] border border-[#e7daf6] bg-[#fcf9ff] px-4 py-3 text-sm text-[#311948] outline-none transition focus:border-[#b388eb] focus:bg-white"
                    />
                  </Field>

                  <Field label={t("whatsappPlaceholder")} help={t("whatsappHelp")}>
                    <div className="relative">
                      <Phone className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#a38dbc]" />
                      <input
                        value={whatsappNumber}
                        onChange={(event) => setWhatsappNumber(event.target.value)}
                        placeholder={t("whatsappPlaceholder")}
                        className="w-full rounded-[20px] border border-[#e7daf6] bg-[#fcf9ff] py-3 pl-11 pr-4 text-sm text-[#311948] outline-none transition focus:border-[#b388eb] focus:bg-white"
                      />
                    </div>
                  </Field>

                  <Field label={t("currencyLabel")}>
                    <select
                      value={defaultCurrency}
                      onChange={(event) => setDefaultCurrency(event.target.value)}
                      className="w-full rounded-[20px] border border-[#e7daf6] bg-[#fcf9ff] px-4 py-3 text-sm text-[#311948] outline-none transition focus:border-[#b388eb] focus:bg-white"
                    >
                      {SUPPORTED_CURRENCIES.map((currency) => (
                        <option key={currency} value={currency}>
                          {currency}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <div className="space-y-5">
                  <div className="rounded-[26px] border border-[#eadcf9] bg-[#fbf7ff] p-5">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex size-11 items-center justify-center rounded-2xl bg-[#f1e6ff] text-[#7a38d8]">
                        <ImagePlus className="size-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-[#301848]">{t("logoLabel")}</p>
                        <p className="text-xs text-[#8d79a5]">{t("logoHelp")}</p>
                      </div>
                    </div>

                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <div
                        className="flex size-[92px] shrink-0 items-center justify-center rounded-[28px] border border-dashed border-[#d8c3f1] bg-white text-xl font-black text-[#7a38d8]"
                        style={{
                          background: logoPreviewUrl
                            ? `center/cover no-repeat url(${logoPreviewUrl})`
                            : `linear-gradient(135deg, ${selectedPalette.colors.accent} 0%, ${selectedPalette.colors.primary} 100%)`,
                          color: logoPreviewUrl ? "transparent" : "#fff",
                        }}
                      >
                        {!logoPreviewUrl ? (name || "BM").slice(0, 2).toUpperCase() : ""}
                      </div>

                      <label className="inline-flex cursor-pointer items-center justify-center rounded-2xl border border-[#decaf5] bg-white px-4 py-3 text-sm font-semibold text-[#6d28d9] transition hover:border-[#cfb1f0] hover:bg-[#fdf9ff]">
                        {t("logoCta")}
                        <input
                          type="file"
                          accept="image/png,image/jpeg"
                          className="hidden"
                          onChange={(event) => setLogoFile(event.target.files?.[0] ?? null)}
                        />
                      </label>
                    </div>
                  </div>

                  <div className="rounded-[26px] border border-[#eadcf9] bg-[#fbf7ff] p-5">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex size-11 items-center justify-center rounded-2xl bg-[#f1e6ff] text-[#7a38d8]">
                        <Palette className="size-5" />
                      </div>
                      <div>
                        <p className="font-semibold text-[#301848]">{t("brandingTitle")}</p>
                        <p className="text-xs text-[#8d79a5]">{t("brandingDescription")}</p>
                      </div>
                    </div>

                    <p className="mb-3 text-sm font-semibold text-[#301848]">{t("paletteLabel")}</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {STORE_PALETTES.map((palette) => (
                        <button
                          key={palette.id}
                          type="button"
                          onClick={() => setSelectedPaletteId(palette.id)}
                          className={cn(
                            "rounded-[22px] border p-3 text-left transition",
                            selectedPaletteId === palette.id
                              ? "border-[#bb92ed] bg-white shadow-[0_12px_30px_rgba(151,94,220,0.12)]"
                              : "border-[#eadcf8] bg-[#fdfbff] hover:border-[#d9c2f5] hover:bg-white",
                          )}
                        >
                          <div className="mb-3 flex gap-2">
                            {Object.values(palette.colors).map((color) => (
                              <span
                                key={color}
                                className="h-8 flex-1 rounded-full"
                                style={{ backgroundColor: color }}
                              />
                            ))}
                          </div>
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-semibold text-[#301848]">{palette.name}</p>
                              <p className="mt-1 text-xs text-[#8d79a5]">{palette.description}</p>
                            </div>
                            {selectedPaletteId === palette.id ? (
                              <span className="rounded-full bg-[#f3e8ff] px-2.5 py-1 text-[11px] font-semibold text-[#7a38d8]">
                                {t("paletteSelected")}
                              </span>
                            ) : null}
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {error ? (
                <div className="rounded-[22px] border border-[#f3cadc] bg-[#fff4f8] px-4 py-3 text-sm text-[#b54472]">
                  {error}
                </div>
              ) : null}

              <div className="rounded-[26px] border border-dashed border-[#ddcaf3] bg-[#fcf8ff] p-5">
                <p className="font-semibold text-[#301848]">{t("futureTitle")}</p>
                <p className="mt-2 text-sm text-[#8d79a5]">{t("futureDescription")}</p>
              </div>

              <button
                onClick={handleCreate}
                disabled={loading || !name || !slug || !whatsappNumber}
                className="inline-flex items-center justify-center rounded-[22px] bg-[linear-gradient(135deg,#ff62b0_0%,#9e48ff_100%)] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_18px_36px_rgba(154,72,255,0.26)] transition hover:scale-[1.01] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {loading ? t("submitting") : t("submit")}
              </button>
            </div>

            <aside className="space-y-5">
              <div className="rounded-[28px] border border-[#eadcf8] bg-white p-5 shadow-[0_16px_45px_rgba(130,87,181,0.08)]">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#9b85b7]">
                  {t("previewBadge")}
                </p>
                <div
                  className="mt-4 rounded-[24px] p-5"
                  style={{
                    background: `linear-gradient(180deg, ${selectedPalette.colors.surface} 0%, #ffffff 100%)`,
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="flex size-[64px] items-center justify-center rounded-[22px] text-lg font-black text-white"
                      style={{
                        background: logoPreviewUrl
                          ? `center/cover no-repeat url(${logoPreviewUrl})`
                          : `linear-gradient(135deg, ${selectedPalette.colors.accent} 0%, ${selectedPalette.colors.primary} 100%)`,
                        color: logoPreviewUrl ? "transparent" : "#fff",
                      }}
                    >
                      {!logoPreviewUrl ? (name || "BM").slice(0, 2).toUpperCase() : ""}
                    </div>
                    <div>
                      <p
                        className="text-lg font-semibold"
                        style={{ color: selectedPalette.colors.text }}
                      >
                        {name || t("namePlaceholder")}
                      </p>
                      <p className="text-sm text-[#8d79a5]">
                        /{slug || t("slugPlaceholder")}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3">
                    <div className="rounded-[20px] bg-white p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a390bb]">
                        {t("previewUrlLabel")}
                      </p>
                      <p className="mt-2 text-sm font-medium text-[#301848]">
                        biasmarket.com/store/{slug || "your-store"}
                      </p>
                    </div>
                    <div className="rounded-[20px] bg-white p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a390bb]">
                        {t("previewPaletteLabel")}
                      </p>
                      <div className="mt-3 flex gap-2">
                        {Object.values(selectedPalette.colors).map((color) => (
                          <span
                            key={color}
                            className="h-10 flex-1 rounded-full"
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-[#eadcf8] bg-[#faf6ff] p-5">
                <p className="font-semibold text-[#301848]">{t("previewTitle")}</p>
                <p className="mt-2 text-sm text-[#8d79a5]">{t("previewDescription")}</p>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </div>
  );
}
