"use client";

import { useState } from "react";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/use-store";
import {
  useNotifications,
  useMarkRead,
  useMarkAllRead,
  useArchiveNotification,
  NotificationRow,
} from "@/features/notifications";

export default function NotificationsPage() {
  const t = useTranslations("dashboard.notifications");
  const tCommon = useTranslations("common");
  const { storeId, loading: storeLoading } = useStore();

  const [tab, setTab] = useState<"active" | "archived">("active");
  const { data: items = [], isPending } = useNotifications(storeId, tab === "archived");
  const markRead = useMarkRead(storeId);
  const markAllRead = useMarkAllRead(storeId);
  const archive = useArchiveNotification(storeId);

  if (storeLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 text-sm text-[#8f7da8]">
        {tCommon("loading")}
      </div>
    );
  }

  return (
    <div className="min-h-screen px-5 py-6 lg:px-8 lg:py-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold tracking-tight text-[#2d1649]">{t("title")}</h1>
          {tab === "active" && items.some((item) => !item.read) ? (
            <Button
              variant="outline"
              onClick={() => markAllRead.mutate()}
              className="store-theme-secondary-button h-10 rounded-2xl border bg-white px-4 text-sm font-semibold shadow-none"
            >
              {t("markAllRead")}
            </Button>
          ) : null}
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab("active")}
            className={cn(
              "rounded-2xl px-4 py-2 text-sm font-semibold transition",
              tab === "active"
                ? "bg-white text-[#2d1649] shadow-sm"
                : "text-[#8f7da8] hover:text-[#2d1649]",
            )}
          >
            {t("tabs.active")}
          </button>
          <button
            type="button"
            onClick={() => setTab("archived")}
            className={cn(
              "rounded-2xl px-4 py-2 text-sm font-semibold transition",
              tab === "archived"
                ? "bg-white text-[#2d1649] shadow-sm"
                : "text-[#8f7da8] hover:text-[#2d1649]",
            )}
          >
            {t("tabs.archived")}
          </button>
        </div>

        <Card className="rounded-[28px] border-[#eadcf7] bg-white py-0 shadow-sm">
          <CardHeader className="sr-only">
            <CardTitle>{t("title")}</CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-[#f0e7f8] px-0 py-0">
            {isPending ? (
              <p className="px-6 py-10 text-center text-sm text-[#9582ad]">{tCommon("loading")}</p>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                <Bell className="size-8 text-[#c9b3e8]" />
                <p className="text-sm text-[#9582ad]">{t("empty")}</p>
              </div>
            ) : (
              items.map((item) => (
                <NotificationRow
                  key={item.id}
                  item={item}
                  showArchive={tab === "active"}
                  onMarkRead={(id) => markRead.mutate(id)}
                  onArchive={(id) => archive.mutate(id)}
                />
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
