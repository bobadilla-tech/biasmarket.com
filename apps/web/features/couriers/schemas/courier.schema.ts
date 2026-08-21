// Local UI-state shape for the couriers editor (features/store-settings's
// delivery section). Mixes persisted couriers (from API) with locally-created
// ones (`id: "new:<timestamp>"`). Not response-shape validation, so plain
// types — see the OpenAPI note in apps/web/AGENTS.md.
export interface CourierModality {
  id: string;
  modality: "AGENCY" | "HOME";
  price: number;
  enabled: boolean;
}

export interface Courier {
  id: string;
  name: string;
  enabled: boolean;
  sortOrder: number;
  modalities: CourierModality[];
}

export const isNewCourier = (id: string) => id.startsWith("new:");

export const NEW_COURIER_ID = "new:";
