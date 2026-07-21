"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";

export interface DashboardStore {
  id: string;
  name: string;
  slug: string;
  whatsappNumber: string | null;
  defaultCurrency: string;
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

  return {
    store,
    storeId: store?.id,
    slug,
    loading: !store && !error,
    error,
  };
}
