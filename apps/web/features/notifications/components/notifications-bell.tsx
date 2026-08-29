"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useNotifications, useUnreadCount } from "../queries/use-notifications";
import { useMarkRead } from "../mutations/use-mark-read";
import { NotificationRow } from "./notification-row";

export function NotificationsBell({
  slug,
  storeId,
}: {
  slug: string;
  storeId?: string;
}) {
  const t = useTranslations("dashboard.notifications");
  const tShell = useTranslations("dashboard.shell");
  const [open, setOpen] = useState(false);

  const { data: unreadCount } = useUnreadCount(storeId);
  const { data: items = [] } = useNotifications(storeId, false, {
    enabled: open,
  });
  const markRead = useMarkRead(storeId);

  const count = unreadCount?.count ?? 0;
  const visibleItems = items.slice(0, 8);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="relative rounded-xl p-2 hover:bg-black/5"
            aria-label={
              count > 0 ? tShell("unreadNotifications", { count }) : t("title")
            }
          >
            <Bell className="size-5" />
            {count > 0 ? (
              <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center rounded-full bg-[#d11d52] text-[10px] font-semibold text-white">
                {count > 9 ? "9+" : count}
              </span>
            ) : null}
          </button>
        }
      />
      <PopoverContent className="w-80 max-w-[calc(100vw-2rem)] p-0">
        <div className="flex items-center justify-between border-b border-[#f0e7f8] px-4 py-3">
          <h2 className="text-sm font-semibold text-[#2d1649]">{t("title")}</h2>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {visibleItems.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[#9582ad]">
              {t("empty")}
            </p>
          ) : (
            visibleItems.map((item) => (
              <NotificationRow
                key={item.id}
                item={item}
                compact
                onMarkRead={(id) => markRead.mutate(id)}
              />
            ))
          )}
        </div>
        <Link
          href={`/dashboard/${slug}/notifications`}
          onClick={() => setOpen(false)}
          className="block border-t border-[#f0e7f8] px-4 py-3 text-center text-sm font-semibold text-[var(--store-primary)]"
        >
          {t("seeAll")}
        </Link>
      </PopoverContent>
    </Popover>
  );
}
