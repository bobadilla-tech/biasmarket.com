"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import type { DashboardStore } from "@/features/stores";
import { useSaveStockAlerts } from "../mutations/use-save-stock-alerts";
import {
  Field,
  SectionCard,
  ToggleRow,
  useSavedFlash,
} from "./section-primitives";

interface NotificationSetting {
  key: "newOrder" | "paymentReview" | "orderDelivered" | "weeklySummary";
  enabled: boolean;
  locked?: boolean;
}

export function NotificationsSection({ store }: { store: DashboardStore }) {
  const t = useTranslations("dashboard.settings");
  const { slug } = useParams<{ slug: string }>();
  const saveStockAlerts = useSaveStockAlerts(store.id, slug);

  const [lowStockAlertsEnabled, setLowStockAlertsEnabled] = useState(
    store.lowStockAlertsEnabled ?? true,
  );
  const [lowStockThreshold, setLowStockThreshold] = useState(
    String(store.lowStockThreshold ?? 5),
  );

  // Local-only placeholders for notification channels that don't have a
  // backend setting yet — orderDelivered/weeklySummary stay permanently
  // disabled until those features exist. Nothing here calls the API.
  const [notifications, setNotifications] = useState<NotificationSetting[]>([
    { key: "newOrder", enabled: true },
    { key: "paymentReview", enabled: true },
    { key: "orderDelivered", enabled: false, locked: true },
    { key: "weeklySummary", enabled: false, locked: true },
  ]);

  useEffect(() => {
    setLowStockAlertsEnabled(store.lowStockAlertsEnabled ?? true);
    setLowStockThreshold(String(store.lowStockThreshold ?? 5));
  }, [store.lowStockAlertsEnabled, store.lowStockThreshold]);

  useSavedFlash(saveStockAlerts.isSuccess, saveStockAlerts.reset);

  const handleSave = () => {
    saveStockAlerts.mutate({
      lowStockAlertsEnabled,
      lowStockThreshold: Math.max(0, Number(lowStockThreshold) || 0),
    });
  };

  return (
    <SectionCard
      icon={Bell}
      title={t("notifications.title")}
      description={t("notifications.description")}
    >
      <div className="space-y-3">
        <ToggleRow
          label={t("notifications.items.lowStock.label")}
          description={t("notifications.items.lowStock.description")}
          enabled={lowStockAlertsEnabled}
          onChange={setLowStockAlertsEnabled}
        />
        {lowStockAlertsEnabled ? (
          <Field
            id="settings-notifications-threshold"
            label={t("notifications.thresholdLabel")}
          >
            <Input
              id="settings-notifications-threshold"
              type="number"
              min={0}
              value={lowStockThreshold}
              onChange={(event) => setLowStockThreshold(event.target.value)}
              className="store-theme-input h-11 w-32 rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] text-[#341b55] shadow-none"
            />
          </Field>
        ) : null}

        {notifications.map((notification) => (
          <ToggleRow
            key={notification.key}
            label={t(`notifications.items.${notification.key}.label`)}
            description={t(
              `notifications.items.${notification.key}.description`,
            )}
            enabled={notification.enabled}
            disabled={notification.locked}
            onChange={(enabled) =>
              setNotifications((current) =>
                current.map((item) =>
                  item.key === notification.key ? { ...item, enabled } : item,
                ),
              )
            }
          />
        ))}
      </div>

      {saveStockAlerts.isError ? (
        <p role="alert" className="mt-4 text-sm text-[#b24368]">
          {saveStockAlerts.error instanceof Error
            ? saveStockAlerts.error.message
            : String(saveStockAlerts.error)}
        </p>
      ) : null}

      <Separator className="my-5 bg-[#f0e7f8]" />

      <div className="flex items-center justify-end gap-4">
        <Button
          onClick={handleSave}
          disabled={saveStockAlerts.isPending}
          className="store-theme-primary-button h-11 rounded-2xl px-5 text-sm font-semibold hover:scale-[1.01] hover:opacity-100"
        >
          {saveStockAlerts.isSuccess
            ? t("saved")
            : saveStockAlerts.isPending
              ? t("saving")
              : t("save")}
        </Button>
      </div>
    </SectionCard>
  );
}
