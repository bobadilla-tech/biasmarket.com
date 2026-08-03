"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { LoadingState } from "@/components/shared/loading-state";
import { ErrorState } from "@/components/shared/error-state";
import { EmptyState } from "@/components/shared/empty-state";
import { useDashboardStore } from "@/features/stores";
import { SuggestionCard, useSuggestions } from "@/features/suggestions";

function dismissedStorageKey(storeId: string) {
  return `suggestions-dismissed-${storeId}`;
}

export function PreferencesPageClient() {
  const t = useTranslations("dashboard.preferences");
  const tCommon = useTranslations("common");
  const { storeId, loading: storeLoading } = useDashboardStore();
  const { data: suggestions, isPending: suggestionsLoading, error } = useSuggestions(
    storeId,
    tCommon("networkError"),
  );

  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!storeId) return;
    const stored = globalThis.localStorage.getItem(dismissedStorageKey(storeId));
    setDismissedIds(stored ? (JSON.parse(stored) as string[]) : []);
  }, [storeId]);

  const handleDismiss = (id: string) => {
    if (!storeId) return;
    const next = [...dismissedIds, id];
    setDismissedIds(next);
    globalThis.localStorage.setItem(dismissedStorageKey(storeId), JSON.stringify(next));
  };

  if (storeLoading || suggestionsLoading) {
    return <LoadingState />;
  }

  if (error) {
    return (
      <div className="px-5 py-6 lg:px-8 lg:py-8">
        <ErrorState message={error instanceof Error ? error.message : tCommon("networkError")} />
      </div>
    );
  }

  const visibleSuggestions = (suggestions ?? []).filter((s) => !dismissedIds.includes(s.id));

  return (
    <div className="min-h-screen px-5 py-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <p className="text-sm font-medium text-[#8e7ca7]">{t("subtitle")}</p>
          <h1 className="text-3xl font-bold tracking-tight text-[#2d1649]">{t("title")}</h1>
        </div>

        {visibleSuggestions.length === 0 ? (
          <EmptyState message={t("empty")} />
        ) : (
          <div className="space-y-4">
            {visibleSuggestions.map((suggestion) => (
              <SuggestionCard key={suggestion.id} suggestion={suggestion} onDismiss={handleDismiss} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
