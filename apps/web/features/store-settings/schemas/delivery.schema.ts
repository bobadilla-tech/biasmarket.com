// Local UI-state shape for the pickup-points editor (features/store-settings's
// delivery section) — a mix of real, persisted points (from the generated
// `PickupPointResponseDto`) and locally-created, not-yet-saved points
// (`id: "new:<timestamp>"`, no server id yet). Not response-shape validation,
// so it stays a plain type rather than a zod schema — see the OpenAPI note
// in apps/web/AGENTS.md for the zod-drop split this follows.
export interface PickupPoint {
  id: string;
  label: string;
  enabled: boolean;
  sortOrder: number;
}

export const isNewPickupPoint = (id: string) => id.startsWith("new:");
