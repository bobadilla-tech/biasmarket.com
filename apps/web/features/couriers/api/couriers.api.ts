import type { Courier, CourierModality } from "../schemas/courier.schema";

const CUID_RE = /^c[a-z0-9]{24,}$/i;
const SAFE_PATH_SEGMENT_RE = /^[a-z0-9_-]+$/i;

function apiUrl() {
  return process.env.INTERNAL_API_URL ?? process.env.NEXT_PUBLIC_API_URL;
}

function encodeSegment(segment: string): string {
  if (SAFE_PATH_SEGMENT_RE.test(segment)) return segment;
  if (CUID_RE.test(segment)) return encodeURIComponent(segment);
  throw new Error("Invalid URL segment");
}

function buildUrl(...segments: string[]): string {
  const base = apiUrl() ?? "";
  const path = segments.map(encodeSegment).join("/");
  return new URL(path, base.includes("://") ? base : `https://${base}`).href;
}

export interface CourierResponse {
  id: string;
  storeId: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  modalities: {
    id: string;
    modality: "AGENCY" | "HOME";
    price: string;
    enabled: boolean;
  }[];
}

export interface CreateCourierInput {
  name: string;
  enabled?: boolean;
  sortOrder?: number;
  modalities: {
    modality: "AGENCY" | "HOME";
    price: number;
    enabled?: boolean;
  }[];
}

export interface UpdateCourierInput {
  name?: string;
  enabled?: boolean;
  sortOrder?: number;
  modalities?: {
    modality?: "AGENCY" | "HOME";
    price?: number;
    enabled?: boolean;
  }[];
}

function mapResponse(r: CourierResponse): Courier {
  return {
    id: r.id,
    name: r.name,
    enabled: r.enabled,
    sortOrder: r.sortOrder,
    modalities: r.modalities.map((m) => ({
      id: m.id,
      modality: m.modality,
      price: Number(m.price),
      enabled: m.enabled,
    })),
  };
}

export const couriersApi = {
  async findAll(storeId: string): Promise<Courier[]> {
    const url = buildUrl("api", "stores", storeId, "couriers");
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new Error("Error al cargar couriers");
    const data: CourierResponse[] = await res.json();
    return data.map(mapResponse);
  },

  async create(storeId: string, input: CreateCourierInput): Promise<Courier> {
    const url = buildUrl("api", "stores", storeId, "couriers");
    const res = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.message ?? "Error al crear courier");
    }
    return mapResponse(await res.json());
  },

  async update(
    storeId: string,
    courierId: string,
    input: UpdateCourierInput,
  ): Promise<Courier> {
    const url = buildUrl("api", "stores", storeId, "couriers", courierId);
    const res = await fetch(url, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.message ?? "Error al actualizar courier");
    }
    return mapResponse(await res.json());
  },

  async remove(storeId: string, courierId: string): Promise<void> {
    const url = buildUrl("api", "stores", storeId, "couriers", courierId);
    const res = await fetch(url, {
      method: "DELETE",
      credentials: "include",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.message ?? "Error al eliminar courier");
    }
  },
};
