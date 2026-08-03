"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useDashboardStore } from "@/features/stores";
import { useCollections } from "@/features/collections";
import {
  SectionForm,
  type SectionFormInput,
  SectionRow,
  useCreateSection,
  useDeleteSection,
  useReorderSections,
  useSections,
} from "@/features/sections";
import { DashboardNav } from "../dashboard-nav";

export function SectionsPageClient() {
  const t = useTranslations("dashboard");
  const tCommon = useTranslations("common");
  const { storeId, slug, loading: storeLoading } = useDashboardStore();

  const sectionsQuery = useSections(storeId, tCommon("networkError"));
  const collectionsQuery = useCollections(storeId, tCommon("networkError"));
  const createSection = useCreateSection(storeId, tCommon("networkError"));
  const deleteSection = useDeleteSection(storeId, tCommon("networkError"));
  const reorderSections = useReorderSections(storeId, tCommon("networkError"));

  const [error, setError] = useState<string | null>(null);

  const sections = sectionsQuery.data ?? [];
  const collections = collectionsQuery.data ?? [];
  const ordered = [...sections].sort((a, b) => a.position - b.position);

  const collectionName = (id: string | null) =>
    collections.find((c) => c.id === id)?.name ?? id;

  const handleCreate = async (values: SectionFormInput) => {
    setError(null);
    try {
      await createSection.mutateAsync(values);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async (id: string) => {
    setError(null);
    try {
      await deleteSection.mutateAsync(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleReorder = async (index: number, direction: -1 | 1) => {
    const items = [...sections].sort((a, b) => a.position - b.position);
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    [items[index], items[target]] = [items[target], items[index]];
    setError(null);
    try {
      await reorderSections.mutateAsync(items.map((i) => i.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
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
      <div className="max-w-3xl mx-auto flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">{t("sections.title")}</h1>
          <DashboardNav slug={slug} active="sections" />
        </div>

        <SectionForm
          collections={collections}
          submitting={createSection.isPending}
          onSubmit={handleCreate}
        />

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {ordered.map((s, index) => (
                <SectionRow
                  key={s.id}
                  section={s}
                  collectionName={collectionName(s.collectionId)}
                  isFirst={index === 0}
                  isLast={index === ordered.length - 1}
                  onMoveUp={() => handleReorder(index, -1)}
                  onMoveDown={() => handleReorder(index, 1)}
                  onDelete={() => handleDelete(s.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
