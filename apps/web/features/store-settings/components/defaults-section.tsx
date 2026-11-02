"use client";

import { useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import type { DashboardStore } from "@/features/stores";
import { useSaveVisibility } from "../mutations/use-save-visibility";
import { SectionCard, ToggleRow, useSavedFlash } from "./section-primitives";

export function DefaultsSection({ store }: { store: DashboardStore }) {
  const t = useTranslations("dashboard.settings");
  const { slug } = useParams<{ slug: string }>();
  const saveVisibility = useSaveVisibility(store.id, slug);

  const [isPublic, setIsPublic] = useState(store.isPublic ?? true);

  useEffect(() => {
    setIsPublic(store.isPublic ?? true);
  }, [store.isPublic]);

  useSavedFlash(saveVisibility.isSuccess, saveVisibility.reset);

  return (
    <SectionCard
      icon={Eye}
      title={t("defaults.visibilityToggleLabel")}
      description={t("defaults.visibilityToggleDescriptionPublic")}
    >
      <div className="space-y-3">
        <ToggleRow
          label={t("defaults.visibilityToggleLabel")}
          description={
            isPublic
              ? t("defaults.visibilityToggleDescriptionPublic")
              : t("defaults.visibilityToggleDescriptionPrivate")
          }
          enabled={isPublic}
          onChange={setIsPublic}
        />
      </div>

      {saveVisibility.isError ? (
        <p className="mt-4 text-sm text-[#b24368]">
          {saveVisibility.error instanceof Error
            ? saveVisibility.error.message
            : String(saveVisibility.error)}
        </p>
      ) : null}

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
