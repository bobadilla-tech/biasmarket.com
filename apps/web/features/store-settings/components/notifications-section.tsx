"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import type { DashboardStore } from "@/features/stores";
import { useSaveStockAlerts } from "../mutations/use-save-stock-alerts";
import {
  Field,
  SectionCard,
  ToggleRow,
  useSavedFlash,
} from "./section-primitives";
import { useSettingsDraftParticipant } from "./settings-save-context";

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
  const parsedThreshold = Number(lowStockThreshold);
  const thresholdIsValid =
    lowStockThreshold.trim().length > 0 &&
    Number.isInteger(parsedThreshold) &&
    parsedThreshold >= 0;

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

  const saveDraft = useCallback(async () => {
    if (lowStockAlertsEnabled && !thresholdIsValid) {
      throw new Error(t("notifications.thresholdInvalid"));
    }
    await saveStockAlerts.mutateAsync({
      lowStockAlertsEnabled,
      lowStockThreshold: lowStockAlertsEnabled
        ? parsedThreshold
        : (store.lowStockThreshold ?? 5),
    });
  }, [
    lowStockAlertsEnabled,
    parsedThreshold,
    saveStockAlerts,
    store.lowStockThreshold,
    t,
    thresholdIsValid,
  ]);
  const discardDraft = useCallback(() => {
    setLowStockAlertsEnabled(store.lowStockAlertsEnabled ?? true);
    setLowStockThreshold(String(store.lowStockThreshold ?? 5));
  }, [store.lowStockAlertsEnabled, store.lowStockThreshold]);
  useSettingsDraftParticipant({
    id: "notifications",
    tab: "messages",
    dirty:
      lowStockAlertsEnabled !== (store.lowStockAlertsEnabled ?? true) ||
      (lowStockAlertsEnabled &&
        lowStockThreshold !== String(store.lowStockThreshold ?? 5)),
    valid: !lowStockAlertsEnabled || thresholdIsValid,
    validationError: t("notifications.thresholdInvalid"),
    save: saveDraft,
    discard: discardDraft,
  });

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
              aria-label={t("notifications.thresholdLabel")}
              type="number"
              min={0}
              value={lowStockThreshold}
              onChange={(event) => setLowStockThreshold(event.target.value)}
              className="store-theme-input h-11 w-32 rounded-2xl border-[#e7dcf3] bg-[#fbf8fe] text-[#341b55] shadow-none"
            />
            {!thresholdIsValid ? (
              <p role="alert" className="mt-1 text-xs text-[#b24368]">
                {t("notifications.thresholdInvalid")}
              </p>
            ) : null}
          </Field>
        ) : null}

        {notifications.map((notification) => (
          <ToggleRow
            key={notification.key}
            label={t(`notifications.items.${notification.key}.label`)}
            description={
              t(`notifications.items.${notification.key}.description`) +
              (notification.locked ? ` · ${t("notifications.comingSoon")}` : "")
            }
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
    </SectionCard>
  );
}
