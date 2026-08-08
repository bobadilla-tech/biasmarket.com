"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Eye,
  EyeOff,
  GripVertical,
  Image,
  LayoutGrid,
  Pencil,
  Text,
  Trash2,
} from "lucide-react";
import type { StoreSectionResponseDto } from "@biasmarket/types";
import { cn } from "@/lib/utils";
import { SectionEditForm } from "./section-edit-form";

interface SectionTileProps {
  section: StoreSectionResponseDto;
  collectionName: string | null;
  savingContent: boolean;
  onToggleHidden: () => void;
  onSaveContent: (content: Record<string, unknown>) => Promise<unknown>;
  onDelete: () => void;
}

const TYPE_ICON = { COLLECTION: LayoutGrid, BANNER: Image, TEXT_BLOCK: Text };

export function SectionTile(
  {
    section,
    collectionName,
    savingContent,
    onToggleHidden,
    onSaveContent,
    onDelete,
  }: SectionTileProps,
) {
  const t = useTranslations("dashboard.sections");
  const [editing, setEditing] = useState(false);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

  const Icon = TYPE_ICON[section.type];
  const typeLabel = section.type === "COLLECTION"
    ? t("collection")
    : section.type === "BANNER"
    ? t("banner")
    : t("textBlock");

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "rounded-xl border border-gray-100 bg-white p-3 shadow-sm",
        isDragging && "opacity-60",
        section.hidden && "bg-gray-50",
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          {...attributes}
          {...listeners}
          aria-label={t("dragHandle")}
          className="cursor-grab touch-none rounded p-1 text-gray-400 hover:bg-gray-100 active:cursor-grabbing"
        >
          <GripVertical className="size-4" />
        </button>

        <Icon className="size-4 shrink-0 text-gray-400" />

        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate text-sm font-medium text-gray-900",
              section.hidden && "text-gray-400",
            )}
          >
            {typeLabel}
            {section.type === "COLLECTION" &&
              `: ${collectionName ?? section.collectionId}`}
          </p>
          {section.hidden && (
            <span className="text-xs text-gray-400">{t("hiddenBadge")}</span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {section.type !== "COLLECTION" && (
            <button
              type="button"
              onClick={() => setEditing((v) => !v)}
              aria-label={t("edit")}
              className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
            >
              <Pencil className="size-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onToggleHidden}
            aria-label={section.hidden ? t("show") : t("hide")}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
          >
            {section.hidden
              ? <EyeOff className="size-4" />
              : <Eye className="size-4" />}
          </button>
          <button
            type="button"
            onClick={onDelete}
            aria-label={t("delete")}
            className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      {editing && (
        <SectionEditForm
          section={section}
          submitting={savingContent}
          onSave={async (content) => {
            await onSaveContent(content);
            setEditing(false);
          }}
          onCancel={() => setEditing(false)}
        />
      )}
    </div>
  );
}
