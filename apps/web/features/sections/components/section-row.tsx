"use client";

import { useTranslations } from "next-intl";
import type { StoreSectionResponseDto } from "@biasmarket/types";

interface SectionRowProps {
  section: StoreSectionResponseDto;
  collectionName: string | null;
  isFirst: boolean;
  isLast: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}

export function SectionRow({
  section,
  collectionName,
  isFirst,
  isLast,
  onMoveUp,
  onMoveDown,
  onDelete,
}: SectionRowProps) {
  const t = useTranslations("dashboard.sections");
  const typeLabel = section.type === "COLLECTION"
    ? t("collection")
    : section.type === "BANNER"
    ? t("banner")
    : t("textBlock");

  return (
    <tr className="border-b border-gray-100 last:border-0">
      <td className="px-6 py-3 text-gray-900">
        {typeLabel}
        {section.type === "COLLECTION" &&
          `: ${collectionName ?? section.collectionId}`}
      </td>
      <td className="px-6 py-3 text-right">
        <div className="flex gap-2 justify-end">
          <button
            onClick={onMoveUp}
            disabled={isFirst}
            className="px-2 py-1 text-xs rounded-lg border border-gray-200 disabled:opacity-40"
          >
            {t("moveUp")}
          </button>
          <button
            onClick={onMoveDown}
            disabled={isLast}
            className="px-2 py-1 text-xs rounded-lg border border-gray-200 disabled:opacity-40"
          >
            {t("moveDown")}
          </button>
          <button
            onClick={onDelete}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-semibold text-gray-600 transition hover:bg-gray-50"
          >
            {t("delete")}
          </button>
        </div>
      </td>
    </tr>
  );
}
