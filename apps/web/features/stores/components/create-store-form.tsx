"use client";

import { useMemo, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ImagePlus,
  Palette,
  Pipette,
  Store,
  WandSparkles,
} from "lucide-react";
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
import { useRouter } from "@/i18n/navigation";
import { buildCustomStorePalette, buildStoreThemeConfig, STORE_PALETTES } from "@/lib/store-theme";
import { cn } from "@/lib/utils";
import { useCreateStore } from "../mutations/use-create-store";
import { createStoreFormSchema, type CreateStoreFormInput } from "../schemas/create-store.schema";

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

export function CreateStoreForm() {
  const t = useTranslations("onboarding.createStore");
  const router = useRouter();
  const createStore = useCreateStore();

  const [selectedPaletteId, setSelectedPaletteId] = useState<string>(STORE_PALETTES[0].id);
  const [customColor, setCustomColor] = useState("#6d28d9");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);

  const {
    register,
    control,
    handleSubmit,
    watch,
    setValue,
    setError,
    reset,
    formState: { errors, dirtyFields },
  } = useForm<CreateStoreFormInput>({
    resolver: zodResolver(createStoreFormSchema),
    defaultValues: {
      name: "",
      slug: "",
      whatsappNumber: "",
      defaultCurrency: SUPPORTED_CURRENCIES[0],
    },
  });

  const name = watch("name");
  const slug = watch("slug");
  const whatsappNumber = watch("whatsappNumber");

  const selectedPalette = useMemo(() => {
    if (selectedPaletteId === "custom") return buildCustomStorePalette(customColor);
    return (
      STORE_PALETTES.find((palette) => palette.id === selectedPaletteId) ?? STORE_PALETTES[0]
    );
  }, [selectedPaletteId, customColor]);

  const slugRegister = register("slug");

  const handleNameChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setValue("name", event.target.value);
    if (!dirtyFields.slug) {
      setValue("slug", slugifyValue(event.target.value));
    }
  };

  const handleLogoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setLogoFile(file);
    if (logoPreviewUrl) URL.revokeObjectURL(logoPreviewUrl);
    setLogoPreviewUrl(file ? URL.createObjectURL(file) : null);
  };

  const onSubmit = handleSubmit(async (values) => {
    try {
      const store = await createStore.mutateAsync({
        values: { ...values, themeConfig: buildStoreThemeConfig(selectedPalette) },
        logoFile,
        genericErrorMessage: t("genericError"),
        logoErrorMessage: t("logoUploadingError"),
      });
      reset();
      setLogoFile(null);
      setLogoPreviewUrl(null);
      setSelectedPaletteId(STORE_PALETTES[0].id);
      router.push(`/dashboard/${store.slug}/settings`);
    } catch (e) {
      setError("root", { message: e instanceof Error ? e.message : t("genericError") });
    }
  });

  return (
    <Card className="rounded-[34px] border-[#efe5fb] bg-white/86 py-0 shadow-[0_24px_80px_rgba(120,74,170,0.08)] backdrop-blur">
      <CardContent className="px-6 py-6 md:px-8 md:py-8">
        <form onSubmit={onSubmit} className="grid gap-8 xl:grid-cols-[minmax(0,1.1fr)_360px]">
          <div className="space-y-8">
            <div>
              <Badge className="rounded-full bg-[#f3e8ff] px-4 py-1.5 text-xs uppercase tracking-[0.2em] text-[#7a38d8]">
                <WandSparkles className="size-3.5" />
                {t("createNew")}
              </Badge>
              <h2 className="mt-4 text-3xl font-bold tracking-tight text-[#2c1647]">
                {t("title")}
              </h2>
              <p className="mt-2 max-w-2xl text-sm text-[#8d79a5]">{t("subtitle")}</p>
            </div>

            <div className="grid gap-8 2xl:grid-cols-2">
              <div className="space-y-5">
                <Field label={t("namePlaceholder")} help={t("nameHelp")}>
                  <div className="relative">
                    <Store className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[#a38dbc]" />
                    <Input
                      {...register("name")}
                      onChange={handleNameChange}
                      placeholder={t("namePlaceholder")}
                      className="h-12 rounded-[20px] border-[#e7daf6] bg-[#fcf9ff] pl-11 text-[#311948] shadow-none"
                    />
                  </div>
                </Field>

                <Field label={t("slugLabel")} help={t("slugHelp")}>
                  <Input
                    {...slugRegister}
                    onChange={(event) => {
                      event.target.value = slugifyValue(event.target.value);
                      slugRegister.onChange(event);
                    }}
                    placeholder={t("slugPlaceholder")}
                    className="h-12 rounded-[20px] border-[#e7daf6] bg-[#fcf9ff] text-[#311948] shadow-none"
                  />
                </Field>

                <Field label={t("whatsappPlaceholder")} help={t("whatsappHelp")}>
                  <Controller
                    control={control}
                    name="whatsappNumber"
                    render={({ field }) => (
                      <PhoneInput
                        value={field.value}
                        onChange={field.onChange}
                        placeholder={t("whatsappPlaceholder")}
                        selectClassName="h-12 rounded-[20px] border border-[#e7daf6] bg-[#fcf9ff] text-sm text-[#311948] outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                        inputClassName="h-12 rounded-[20px] border border-[#e7daf6] bg-[#fcf9ff] px-4 text-[#311948] outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                      />
                    )}
                  />
                </Field>

                <Field label={t("currencyLabel")}>
                  <Select
                    {...register("defaultCurrency")}
                    className="h-12 w-32"
                    selectClassName="h-full rounded-[20px] border border-[#e7daf6] bg-[#fcf9ff] text-sm text-[#311948] outline-none focus:border-ring focus:ring-3 focus:ring-ring/50"
                  >
                    {SUPPORTED_CURRENCIES.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>

              <div className="space-y-5">
                <Card className="rounded-[26px] border-[#eadcf9] bg-[#fbf7ff] py-0 shadow-none">
                  <CardHeader className="px-5 pt-5">
                    <div className="flex items-center gap-3">
                      <div className="flex size-11 items-center justify-center rounded-2xl bg-[#f1e6ff] text-[#7a38d8]">
                        <ImagePlus className="size-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base text-[#301848]">
                          {t("logoLabel")}
                        </CardTitle>
                        <CardDescription className="text-xs text-[#8d79a5]">
                          {t("logoHelp")}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="px-5 pb-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                      <div
                        className="flex size-[92px] shrink-0 items-center justify-center rounded-[28px] border border-dashed border-[#d8c3f1] bg-white text-xl font-black"
                        style={{
                          background: logoPreviewUrl
                            ? `center/cover no-repeat url(${logoPreviewUrl})`
                            : `linear-gradient(135deg, ${selectedPalette.colors.accent} 0%, ${selectedPalette.colors.primary} 100%)`,
                          color: logoPreviewUrl ? "transparent" : "#fff",
                        }}
                      >
                        {!logoPreviewUrl ? (name || "BM").slice(0, 2).toUpperCase() : ""}
                      </div>

                      <input
                        ref={logoInputRef}
                        type="file"
                        accept="image/png,image/jpeg"
                        className="hidden"
                        onChange={handleLogoChange}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => logoInputRef.current?.click()}
                        className="h-11 rounded-2xl border-[#decaf5] bg-white px-4 text-[#6d28d9] shadow-none hover:bg-[#fdf9ff]"
                      >
                        {t("logoCta")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="rounded-[26px] border-[#eadcf9] bg-[#fbf7ff] py-0 shadow-none">
                  <CardHeader className="px-5 pt-5">
                    <div className="flex items-center gap-3">
                      <div className="flex size-11 items-center justify-center rounded-2xl bg-[#f1e6ff] text-[#7a38d8]">
                        <Palette className="size-5" />
                      </div>
                      <div>
                        <CardTitle className="text-base text-[#301848]">
                          {t("brandingTitle")}
                        </CardTitle>
                        <CardDescription className="text-xs text-[#8d79a5]">
                          {t("brandingDescription")}
                        </CardDescription>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4 px-5 pb-5">
                    <p className="text-sm font-semibold text-[#301848]">{t("paletteLabel")}</p>
                    <div className="flex flex-wrap items-center gap-3">
                      {STORE_PALETTES.map((palette) => (
                        <button
                          key={palette.id}
                          type="button"
                          title={palette.name}
                          aria-label={palette.name}
                          onClick={() => setSelectedPaletteId(palette.id)}
                          className={cn(
                            "size-10 shrink-0 rounded-full ring-2 ring-offset-2 ring-offset-[#fbf7ff] transition-transform hover:scale-105",
                            selectedPaletteId === palette.id
                              ? "ring-[#7a38d8]"
                              : "ring-transparent",
                          )}
                          style={{ backgroundColor: palette.colors.primary }}
                        />
                      ))}

                      <Popover>
                        <PopoverTrigger
                          type="button"
                          title={t("customColorLabel")}
                          aria-label={t("customColorLabel")}
                          onClick={() => setSelectedPaletteId("custom")}
                          className={cn(
                            "flex size-10 shrink-0 items-center justify-center rounded-full border-2 border-dashed ring-2 ring-offset-2 ring-offset-[#fbf7ff] transition-transform hover:scale-105",
                            selectedPaletteId === "custom"
                              ? "border-solid border-transparent ring-[#7a38d8]"
                              : "border-[#c9b3e8] text-[#7a38d8] ring-transparent",
                          )}
                          style={
                            selectedPaletteId === "custom"
                              ? { backgroundColor: customColor }
                              : undefined
                          }
                        >
                          {selectedPaletteId !== "custom" ? <Pipette className="size-4" /> : null}
                        </PopoverTrigger>
                        <PopoverContent className="w-auto">
                          <p className="mb-3 text-sm font-semibold text-[#301848]">
                            {t("customColorLabel")}
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
                  </CardContent>
                </Card>
              </div>
            </div>

            {errors.root ? (
              <Card className="rounded-[22px] border-[#f3cadc] bg-[#fff4f8] py-0 shadow-none">
                <CardContent className="px-4 py-3 text-sm text-[#b54472]">
                  {errors.root.message}
                </CardContent>
              </Card>
            ) : null}

            <Card className="rounded-[26px] border-dashed border-[#ddcaf3] bg-[#fcf8ff] py-0 shadow-none">
              <CardContent className="px-5 py-5">
                <p className="font-semibold text-[#301848]">{t("futureTitle")}</p>
                <p className="mt-2 text-sm text-[#8d79a5]">{t("futureDescription")}</p>
              </CardContent>
            </Card>

            <Button
              type="submit"
              disabled={createStore.isPending || !name || !slug || !whatsappNumber}
              style={{
                background: `linear-gradient(135deg, ${selectedPalette.colors.accent} 0%, ${selectedPalette.colors.primary} 100%)`,
                boxShadow: `0 18px 36px rgba(0, 0, 0, 0.14)`,
              }}
              className="h-12 rounded-[22px] px-6 text-sm font-semibold text-white hover:opacity-95"
            >
              {createStore.isPending ? t("submitting") : t("submit")}
            </Button>
          </div>

          <div className="space-y-5">
            <Card className="rounded-[28px] border-[#eadcf8] bg-[#faf6ff] py-0 shadow-none">
              <CardContent className="px-5 py-5">
                <p className="font-semibold text-[#301848]">{t("previewTitle")}</p>
                <p className="mt-2 text-sm text-[#8d79a5]">{t("previewDescription")}</p>
              </CardContent>
            </Card>

            <Card className="rounded-[28px] border-[#eadcf8] bg-white py-0 shadow-[0_16px_45px_rgba(130,87,181,0.08)]">
              <CardHeader className="px-5 pt-5">
                <Badge
                  variant="outline"
                  className="w-fit rounded-full border-[#eadcf8] bg-white px-3 py-1 text-[11px] uppercase tracking-[0.24em] text-[#9b85b7]"
                >
                  {t("previewBadge")}
                </Badge>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                <div
                  className="rounded-[24px] p-5"
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
                      <p className="text-sm text-[#8d79a5]">/{slug || t("slugPlaceholder")}</p>
                    </div>
                  </div>

                  <Separator className="my-5 bg-white/70" />

                  <div className="grid gap-3">
                    <Card className="rounded-[20px] bg-white py-0 shadow-sm ring-0">
                      <CardContent className="px-4 py-4">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#a390bb]">
                          {t("previewUrlLabel")}
                        </p>
                        <p className="mt-2 text-sm font-medium text-[#301848]">
                          biasmarket.com/store/{slug || "your-store"}
                        </p>
                      </CardContent>
                    </Card>
                    <Card className="rounded-[20px] bg-white py-0 shadow-sm ring-0">
                      <CardContent className="px-4 py-4">
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
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
