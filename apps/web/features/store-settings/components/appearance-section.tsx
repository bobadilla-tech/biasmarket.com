"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Palette, Pipette } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { StoreLogo } from "@/components/store-logo";
import {
  buildCustomStorePalette,
  buildStoreThemeConfig,
  ensureContrast,
  resolveStorePalette,
  STORE_PALETTES,
} from "@/lib/store-theme";
import { cn } from "@/lib/utils";
import type { DashboardStore } from "@/features/stores";
import { useSaveAppearance } from "../mutations/use-save-appearance";
import { SectionCard, useSavedFlash } from "./section-primitives";
import { useSettingsDraftParticipant } from "./settings-save-context";

export function AppearanceSection({ store }: { store: DashboardStore }) {
  const t = useTranslations("dashboard.settings");
  const { slug } = useParams<{ slug: string }>();
  const saveAppearance = useSaveAppearance(store.id, slug);

  const initial = useMemo(
    () => resolveStorePalette(store.themeConfig),
    [store.themeConfig],
  );
  const initialIsPreset = STORE_PALETTES.some(
    (palette) => palette.id === initial.id,
  );

  const [selectedPaletteId, setSelectedPaletteId] = useState(
    initialIsPreset ? initial.id : "custom",
  );
  const [customColor, setCustomColor] = useState(
    initialIsPreset ? "#6d28d9" : initial.colors.primary,
  );
  const [customAccent, setCustomAccent] = useState(
    initialIsPreset ? "#f472b6" : initial.colors.accent,
  );

  useEffect(() => {
    setSelectedPaletteId(initialIsPreset ? initial.id : "custom");
    if (!initialIsPreset) {
      setCustomColor(initial.colors.primary);
      setCustomAccent(initial.colors.accent);
    }
  }, [
    initialIsPreset,
    initial.id,
    initial.colors.primary,
    initial.colors.accent,
  ]);

  useSavedFlash(saveAppearance.isSuccess, saveAppearance.reset);

  const selectedPalette = useMemo(() => {
    if (selectedPaletteId === "custom") {
      return buildCustomStorePalette(customColor, customAccent);
    }
    return (
      STORE_PALETTES.find((palette) => palette.id === selectedPaletteId) ??
      STORE_PALETTES[0]
    );
  }, [selectedPaletteId, customColor, customAccent]);

  const paletteSignature = JSON.stringify({
    id: selectedPalette.id,
    colors: selectedPalette.colors,
  });
  const initialSignature = JSON.stringify({
    id: initial.id,
    colors: initial.colors,
  });
  const saveDraft = useCallback(async () => {
    await saveAppearance.mutateAsync(buildStoreThemeConfig(selectedPalette));
  }, [saveAppearance, selectedPalette]);
  const discardDraft = useCallback(() => {
    setSelectedPaletteId(initialIsPreset ? initial.id : "custom");
    setCustomColor(initialIsPreset ? "#6d28d9" : initial.colors.primary);
    setCustomAccent(initialIsPreset ? "#f472b6" : initial.colors.accent);
  }, [
    initial.colors.accent,
    initial.colors.primary,
    initial.id,
    initialIsPreset,
  ]);
  useSettingsDraftParticipant({
    id: "appearance",
    tab: "appearance",
    dirty: paletteSignature !== initialSignature,
    save: saveDraft,
    discard: discardDraft,
  });

  return (
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
              "h-auto flex-col items-stretch rounded-3xl p-4 text-left shadow-none",
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
              "h-auto flex-col items-stretch rounded-3xl border p-4 text-left shadow-none",
              selectedPaletteId === "custom"
                ? "bg-white shadow-sm"
                : "bg-[#fcf9ff] hover:bg-white",
            )}
            style={{
              borderColor:
                selectedPaletteId === "custom"
                  ? "var(--store-primary)"
                  : "#eadcf8",
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
            <div className="grid gap-3">
              <label className="grid gap-1 text-sm font-semibold text-[#301848]">
                {t("appearance.primaryColorLabel")}
                <input
                  aria-label={t("appearance.primaryColorLabel")}
                  type="color"
                  value={customColor}
                  onChange={(event) => {
                    setCustomColor(event.target.value);
                    setSelectedPaletteId("custom");
                  }}
                  className="h-10 w-full cursor-pointer rounded-lg border border-[#eadcf8]"
                />
              </label>
              <label className="grid gap-1 text-sm font-semibold text-[#301848]">
                {t("appearance.secondaryColorLabel")}
                <input
                  aria-label={t("appearance.secondaryColorLabel")}
                  type="color"
                  value={customAccent}
                  onChange={(event) => {
                    setCustomAccent(event.target.value);
                    setSelectedPaletteId("custom");
                  }}
                  className="h-10 w-full cursor-pointer rounded-lg border border-[#eadcf8]"
                />
              </label>
            </div>
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
              name={store.name}
              size={56}
              className="text-sm font-black"
              gradient={{
                from: selectedPalette.colors.accent,
                to: selectedPalette.colors.primary,
              }}
            />
            <div className="flex-1">
              <Button
                type="button"
                className="h-11 w-full rounded-2xl text-sm font-semibold hover:opacity-100"
                style={{
                  background: `linear-gradient(135deg, ${ensureContrast(selectedPalette.colors.accent, "#ffffff", 4.5)} 0%, ${ensureContrast(selectedPalette.colors.primary, "#ffffff", 4.5)} 100%)`,
                }}
              >
                {t("appearance.previewButton")}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {saveAppearance.isError ? (
        <p className="mt-4 text-sm text-[#b24368]">
          {saveAppearance.error instanceof Error
            ? saveAppearance.error.message
            : String(saveAppearance.error)}
        </p>
      ) : null}

      <p className="mt-5 text-sm text-[#8f7da8]">{t("appearance.help")}</p>
    </SectionCard>
  );
}
