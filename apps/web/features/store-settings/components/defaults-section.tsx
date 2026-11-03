"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import type { DashboardStore } from "@/features/stores";
import { useSaveVisibility } from "../mutations/use-save-visibility";
import { SectionCard, ToggleRow, useSavedFlash } from "./section-primitives";
import { useSettingsDraftParticipant } from "./settings-save-context";

export function DefaultsSection({ store }: { store: DashboardStore }) {
  const t = useTranslations("dashboard.settings");
  const { slug } = useParams<{ slug: string }>();
  const saveVisibility = useSaveVisibility(store.id, slug);

  const [isPublic, setIsPublic] = useState(store.isPublic ?? true);

  useEffect(() => {
    setIsPublic(store.isPublic ?? true);
  }, [store.isPublic]);

  useSavedFlash(saveVisibility.isSuccess, saveVisibility.reset);

  const saveDraft = useCallback(async () => {
    await saveVisibility.mutateAsync({ isPublic });
  }, [isPublic, saveVisibility]);
  const discardDraft = useCallback(
    () => setIsPublic(store.isPublic ?? true),
    [store.isPublic],
  );
  useSettingsDraftParticipant({
    id: "visibility",
    tab: "store",
    dirty: isPublic !== (store.isPublic ?? true),
    save: saveDraft,
    discard: discardDraft,
  });

  return (
    <SectionCard
      icon={Eye}
      title={t("defaults.visibilityToggleLabel")}
      description={
        isPublic
          ? t("defaults.visibilityToggleDescriptionPublic")
          : t("defaults.visibilityToggleDescriptionPrivate")
      }
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
          disabled={saveVisibility.isPending}
        />
      </div>

      {saveVisibility.isError ? (
        <p className="mt-4 text-sm text-[#b24368]">
          {saveVisibility.error instanceof Error
            ? saveVisibility.error.message
            : String(saveVisibility.error)}
        </p>
      ) : null}
    </SectionCard>
  );
}
