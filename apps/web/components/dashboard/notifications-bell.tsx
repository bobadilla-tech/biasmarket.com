"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

interface NotificationItem {
  id: string;
  type: "LOW_STOCK" | "OUT_OF_STOCK";
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export function NotificationsBell({ slug, storeId }: { slug: string; storeId?: string }) {
  const t = useTranslations("dashboard.notifications");
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!storeId) return;
    let ignore = false;
    apiFetch(`/stores/${storeId}/notifications/unread-count`)
      .then((data) => {
        if (!ignore) setCount(data.count ?? 0);
      })
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [storeId]);

  useEffect(() => {
    if (!open || !storeId) return;
    apiFetch(`/stores/${storeId}/notifications?archived=false`)
      .then((data: NotificationItem[]) => setItems(data.slice(0, 8)))
      .catch(() => undefined);
  }, [open, storeId]);

  const handleMarkRead = async (id: string) => {
    if (!storeId) return;
    await apiFetch(`/stores/${storeId}/notifications/${id}/read`, { method: "PATCH" }).catch(
      () => undefined,
    );
    setItems((current) => current.map((item) => (item.id === id ? { ...item, read: true } : item)));
    setCount((current) => Math.max(0, current - 1));
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className="relative rounded-xl p-2 hover:bg-black/5"
            aria-label={t("title")}
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
      <PopoverContent className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-[#f0e7f8] px-4 py-3">
          <p className="text-sm font-semibold text-[#2d1649]">{t("title")}</p>
        </div>
        <div className="max-h-80 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[#9582ad]">{t("empty")}</p>
          ) : (
            items.map((item) => (
              <div
                key={item.id}
                className={cn(
                  "border-b border-[#f5eefc] px-4 py-3 last:border-b-0",
                  !item.read && "bg-[#fbf6ff]",
                )}
              >
                <p className="text-sm font-medium text-[#341b55]">{item.title}</p>
                <p className="mt-0.5 text-xs text-[#9582ad]">{item.body}</p>
                {!item.read ? (
                  <button
                    type="button"
                    onClick={() => handleMarkRead(item.id)}
                    className="mt-1 text-xs font-semibold text-[var(--store-primary)]"
                  >
                    {t("markRead")}
                  </button>
                ) : null}
              </div>
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
