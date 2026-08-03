"use client";

import { useMutation } from "@tanstack/react-query";
import { useUpdateDashboardStoreCache } from "@/features/stores";
import { settingsApi } from "../api/settings.api";
import type { ProfileFormInput } from "../schemas/profile.schema";

export function useSaveProfile(storeId: string | undefined, slug: string) {
  const updateStoreCache = useUpdateDashboardStoreCache();

  return useMutation({
    mutationFn: (values: ProfileFormInput) =>
      settingsApi.updateProfile(storeId as string, values),
    onSuccess: (_data, values) => updateStoreCache(slug, values),
  });
}
