"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/use-store";

interface NotificationItem {
  id: string;
  type: "LOW_STOCK" | "OUT_OF_STOCK";
  title: string;
  body: string;
  read: boolean;
  archived: boolean;
  createdAt: string;
}

export default function NotificationsPage() {
  const t = useTranslations("dashboard.notifications");
  const tCommon = useTranslations("common");
  const { storeId, loading: storeLoading } = useStore();

  const [tab, setTab] = useState<"active" | "archived">("active");
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const data = await apiFetch(
        `/stores/${storeId}/notifications?archived=${tab === "archived"}`,
      );
      setItems(data);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeId, tab]);

  const handleMarkRead = async (id: string) => {
    await apiFetch(`/stores/${storeId}/notifications/${id}/read`, { method: "PATCH" });
    setItems((current) => current.map((item) => (item.id === id ? { ...item, read: true } : item)));
  };

  const handleMarkAllRead = async () => {
    await apiFetch(`/stores/${storeId}/notifications/read-all`, { method: "POST" });
    setItems((current) => current.map((item) => ({ ...item, read: true })));
  };

  const handleArchive = async (id: string) => {
    await apiFetch(`/stores/${storeId}/notifications/${id}/archive`, { method: "PATCH" });
    setItems((current) => current.filter((item) => item.id !== id));
  };

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
              onClick={handleMarkAllRead}
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
            {loading ? (
              <p className="px-6 py-10 text-center text-sm text-[#9582ad]">{tCommon("loading")}</p>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
                <Bell className="size-8 text-[#c9b3e8]" />
                <p className="text-sm text-[#9582ad]">{t("empty")}</p>
              </div>
            ) : (
              items.map((item) => (
                <div key={item.id} className="flex items-start justify-between gap-4 px-6 py-4">
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
                      {!item.read ? (
                        <span className="size-2 rounded-full bg-[var(--store-primary)]" />
                      ) : null}
                    </div>
                    <p className="text-sm font-medium text-[#341b55]">{item.title}</p>
                    <p className="mt-0.5 text-xs text-[#9582ad]">{item.body}</p>
                    <p className="mt-1 text-[11px] text-[#b3a3c7]">
                      {new Date(item.createdAt).toLocaleString()}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {!item.read ? (
                      <Button
                        variant="outline"
                        onClick={() => handleMarkRead(item.id)}
                        className="h-9 rounded-xl border-[#eadcf7] bg-white px-3 text-xs font-semibold shadow-none"
                      >
                        {t("markRead")}
                      </Button>
                    ) : null}
                    {tab === "active" ? (
                      <Button
                        variant="outline"
                        onClick={() => handleArchive(item.id)}
                        className="h-9 rounded-xl border-[#eadcf7] bg-white px-3 text-xs font-semibold shadow-none"
                      >
                        {t("archive")}
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
