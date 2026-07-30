"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import type { StoreThemeConfig } from "@/lib/store-theme";

export interface DashboardStoreUpdatedDetail {
  slug: string;
  store: Partial<DashboardStore>;
}

export interface DashboardStore {
  id: string;
  name: string;
  slug: string;
  whatsappNumber: string | null;
  defaultCurrency: string;
  logoUrl?: string | null;
  paymentInstructions?: string;
  themeConfig?: StoreThemeConfig | null;
  lowStockThreshold?: number;
  lowStockAlertsEnabled?: boolean;
}

export function broadcastStoreUpdate(detail: DashboardStoreUpdatedDetail) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<DashboardStoreUpdatedDetail>("biasmarket:store-updated", {
      detail,
    }),
  );
}

export function useStore() {
  const { slug } = useParams<{ slug: string }>();
  const [store, setStore] = useState<DashboardStore | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    setStore(null);
    setError(null);
    apiFetch(`/stores/by-slug/${slug}`)
      .then((data) => {
        if (!ignore) setStore(data);
      })
      .catch((e) => {
        if (!ignore) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      ignore = true;
    };
  }, [slug]);

  useEffect(() => {
    const handleStoreUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<DashboardStoreUpdatedDetail>;
      if (customEvent.detail.slug !== slug) return;

      setStore((current) => {
        if (!current) return current;
        return { ...current, ...customEvent.detail.store };
      });
    };

    window.addEventListener("biasmarket:store-updated", handleStoreUpdated);
    return () => {
      window.removeEventListener("biasmarket:store-updated", handleStoreUpdated);
    };
  }, [slug]);

  return {
    store,
    storeId: store?.id,
    slug,
    loading: !store && !error,
    error,
  };
}
