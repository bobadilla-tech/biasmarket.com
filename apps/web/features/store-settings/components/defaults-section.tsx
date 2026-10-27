"use client";

import { useEffect, useMemo, useState } from "react";
import { Building2, Copy } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { DashboardStore } from "@/features/stores";
import { useSaveVisibility } from "../mutations/use-save-visibility";
import { SectionCard, ToggleRow, useSavedFlash } from "./section-primitives";

export function DefaultsSection({ store }: { store: DashboardStore }) {
  const t = useTranslations("dashboard.settings");
  const { locale, slug } = useParams<{ locale: string; slug: string }>();
  const saveVisibility = useSaveVisibility(store.id, slug);

  const [isPublic, setIsPublic] = useState(store.isPublic ?? true);

  useEffect(() => {
    setIsPublic(store.isPublic ?? true);
  }, [store.isPublic]);

  useSavedFlash(saveVisibility.isSuccess, saveVisibility.reset);

  const storefrontUrl = useMemo(() => {
    if (typeof window === "undefined") return `/${locale}/store/${slug}`;
    return `${globalThis.location.origin}/${locale}/store/${slug}`;
  }, [locale, slug]);

  return (
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
              {store.defaultCurrency}
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

        <ToggleRow
          label={t("defaults.visibilityToggleLabel")}
          description={isPublic
            ? t("defaults.visibilityToggleDescriptionPublic")
            : t("defaults.visibilityToggleDescriptionPrivate")}
          enabled={isPublic}
          onChange={setIsPublic}
        />
      </div>

      {saveVisibility.isError
        ? (
          <p className="mt-4 text-sm text-[#b24368]">
            {saveVisibility.error instanceof Error
              ? saveVisibility.error.message
              : String(saveVisibility.error)}
          </p>
        )
        : null}

      <Separator className="my-5 bg-[#f0e7f8]" />

      <div className="flex items-center justify-end gap-4">
        <Button
          onClick={() => saveVisibility.mutate({ isPublic })}
          disabled={saveVisibility.isPending}
          className="store-theme-primary-button h-11 rounded-2xl px-5 text-sm font-semibold hover:scale-[1.01] hover:opacity-100"
        >
          {saveVisibility.isSuccess
            ? t("saved")
            : saveVisibility.isPending
            ? t("saving")
            : t("save")}
        </Button>
      </div>
    </SectionCard>
  );
}
