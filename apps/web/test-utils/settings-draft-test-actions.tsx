"use client";

import type { ReactNode } from "react";
import {
  SettingsDraftProvider,
  useSettingsDraftContext,
  type SettingsTabId,
} from "@/features/store-settings/components/settings-save-context";

function SaveSettingsTab({ tab }: { tab: SettingsTabId }) {
  const { save } = useSettingsDraftContext();
  return (
    <button type="button" onClick={() => void save(tab)}>
      Save tab
    </button>
  );
}

export function withSettingsDraftActions(
  children: ReactNode,
  tab: SettingsTabId,
) {
  return (
    <SettingsDraftProvider>
      {children}
      <SaveSettingsTab tab={tab} />
    </SettingsDraftProvider>
  );
}
