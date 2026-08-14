"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { StoreSectionResponseDto } from "@biasmarket/types";
import { useDashboardStore } from "@/features/stores";
import { useCollections } from "@/features/collections";
import { StoreSectionRenderer } from "@/components/storefront/section-renderer";
import {
  hydrateSections,
  SectionForm,
  type SectionFormInput,
  SectionTile,
  useCreateSection,
  useDeleteSection,
  useReorderSections,
  useSections,
  useUpdateSection,
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
  const updateSection = useUpdateSection(storeId, tCommon("networkError"));

  const [error, setError] = useState<string | null>(null);
  const [mobileTab, setMobileTab] = useState<"list" | "preview">("list");
  const [localSections, setLocalSections] = useState<StoreSectionResponseDto[]>(
    [],
  );

  // Memoized so the `[]` fallback while `sectionsQuery.data` is still
  // undefined keeps a stable reference across renders — otherwise it's a
  // fresh array every render, the effect below re-fires every commit, and
  // the resulting setState loop pegs the tab until the query resolves.
  const serverSections = useMemo(
    () => sectionsQuery.data ?? [],
    [sectionsQuery.data],
  );
  const collections = collectionsQuery.data ?? [];

  // The drag list needs to reorder optimistically without waiting for a
  // round-trip on every frame, so it owns a local copy synced from the
  // query result — see the plan's note on only committing on index changes,
  // not per-pointer-move.
  useEffect(() => {
    setLocalSections(
      [...serverSections].sort((a, b) => a.position - b.position),
    );
  }, [serverSections]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

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

  const resyncLocalSections = () => {
    setLocalSections(
      [...(sectionsQuery.data ?? [])].sort((a, b) => a.position - b.position),
    );
  };

  const handleToggleHidden = async (section: StoreSectionResponseDto) => {
    setError(null);
    setLocalSections((items) =>
      items.map((s) => (s.id === section.id ? { ...s, hidden: !s.hidden } : s)),
    );
    try {
      await updateSection.mutateAsync({
        sectionId: section.id,
        dto: { hidden: !section.hidden },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      resyncLocalSections();
    }
  };

  const handleSaveContent = async (
    section: StoreSectionResponseDto,
    content: Record<string, unknown>,
  ) => {
    setError(null);
    try {
      await updateSection.mutateAsync({
        sectionId: section.id,
        dto: { content },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = localSections.findIndex((s) => s.id === active.id);
    const newIndex = localSections.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(localSections, oldIndex, newIndex);
    setLocalSections(reordered);
    setError(null);
    try {
      await reorderSections.mutateAsync(reordered.map((s) => s.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      resyncLocalSections();
    }
  };

  if (storeLoading) {
    return (
      <div className="min-h-screen bg-gray-50 px-6 py-10 text-sm text-gray-500">
        {tCommon("loading")}
      </div>
    );
  }

  const previewSections = hydrateSections(localSections, collections);

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-10">
      <div className="max-w-6xl mx-auto flex flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-bold text-gray-900">
            {t("sections.title")}
          </h1>
          <DashboardNav slug={slug} active="sections" />
        </div>

        <SectionForm
          collections={collections}
          submitting={createSection.isPending}
          onSubmit={handleCreate}
        />

        {error && <p className="text-sm text-red-500">{error}</p>}

        <div className="flex gap-2 md:hidden">
          <button
            type="button"
            onClick={() => setMobileTab("list")}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
              mobileTab === "list"
                ? "store-theme-primary-button"
                : "border border-gray-200 text-gray-600"
            }`}
          >
            {t("sections.title")}
          </button>
          <button
            type="button"
            onClick={() => setMobileTab("preview")}
            className={`rounded-full px-4 py-1.5 text-xs font-semibold ${
              mobileTab === "preview"
                ? "store-theme-primary-button"
                : "border border-gray-200 text-gray-600"
            }`}
          >
            {t("sections.preview")}
          </button>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <div className={mobileTab === "list" ? "block" : "hidden md:block"}>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={localSections.map((s) => s.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="flex flex-col gap-2">
                  {localSections.map((section) => (
                    <SectionTile
                      key={section.id}
                      section={section}
                      collectionName={collectionName(section.collectionId)}
                      savingContent={updateSection.isPending}
                      onToggleHidden={() => handleToggleHidden(section)}
                      onSaveContent={(content) =>
                        handleSaveContent(section, content)
                      }
                      onDelete={() => handleDelete(section.id)}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </div>

          <div
            className={mobileTab === "preview" ? "block" : "hidden md:block"}
          >
            <div className="sticky top-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">
                {t("sections.preview")}
              </p>
              {previewSections.length === 0 ? (
                <p className="text-sm text-gray-400">
                  {t("sections.emptyPreview")}
                </p>
              ) : (
                <div className="space-y-6 pointer-events-none">
                  <StoreSectionRenderer
                    slug={slug}
                    sections={previewSections}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
