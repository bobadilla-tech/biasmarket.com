import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { NotificationItem } from "../schemas/notification.schema";

export function NotificationRow({
  item,
  compact = false,
  showArchive = false,
  onMarkRead,
  onArchive,
}: {
  item: NotificationItem;
  compact?: boolean;
  showArchive?: boolean;
  onMarkRead: (id: string) => void;
  onArchive?: (id: string) => void;
}) {
  const t = useTranslations("dashboard.notifications");

  if (compact) {
    return (
      <div
        className={cn(
          "border-b border-[#f5eefc] px-4 py-3 last:border-b-0",
          !item.read && "bg-[#fbf6ff]",
        )}
      >
        <p className="text-sm font-medium text-[#341b55]">{item.title}</p>
        <p className="mt-0.5 text-xs text-[#9582ad]">{item.body}</p>
        {!item.read
          ? (
            <button
              type="button"
              onClick={() => onMarkRead(item.id)}
              className="mt-1 text-xs font-semibold text-[var(--store-primary)]"
            >
              {t("markRead")}
            </button>
          )
          : null}
      </div>
    );
  }

  return (
    <div className="flex items-start justify-between gap-4 px-6 py-4">
      <div className="flex-1">
        <div className="mb-1 flex items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
              item.type === "OUT_OF_STOCK"
                ? "border-[#f3cbd8] bg-[#fff3f7] text-[#b24368]"
                : "border-[#f5e0bb] bg-[#fff8ea] text-[#a8730f]",
            )}
          >
            {t(`types.${item.type}`)}
          </Badge>
          {!item.read
            ? <span className="size-2 rounded-full bg-[var(--store-primary)]" />
            : null}
        </div>
        <p className="text-sm font-medium text-[#341b55]">{item.title}</p>
        <p className="mt-0.5 text-xs text-[#9582ad]">{item.body}</p>
        <p className="mt-1 text-[11px] text-[#b3a3c7]">
          {new Date(item.createdAt).toLocaleString()}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        {!item.read
          ? (
            <Button
              variant="outline"
              onClick={() => onMarkRead(item.id)}
              className="h-9 rounded-xl border-[#eadcf7] bg-white px-3 text-xs font-semibold shadow-none"
            >
              {t("markRead")}
            </Button>
          )
          : null}
        {showArchive && onArchive
          ? (
            <Button
              variant="outline"
              onClick={() => onArchive(item.id)}
              className="h-9 rounded-xl border-[#eadcf7] bg-white px-3 text-xs font-semibold shadow-none"
            >
              {t("archive")}
            </Button>
          )
          : null}
      </div>
    </div>
  );
}
