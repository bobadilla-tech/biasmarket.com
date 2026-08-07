// JS Date.getDay() convention: 0=Sunday..6=Saturday — mirrors
// PickupPoint.openDays server-side (see packages/db/prisma/schema.prisma).
export interface PickupAvailabilityInput {
  openDays: number[];
  closedOverride: boolean;
  // The public endpoint already filters to enabled points, but the form
  // also carries the field — a disabled point must never be selectable even
  // if its openDays/closedOverride say it's open today (defense in depth).
  enabled?: boolean;
}

export interface PickupAvailability {
  availableToday: boolean;
  // Only set when not available today and a future open day exists to
  // point to — null for "manually closed" (closedOverride, no schedule to
  // fall back on) and for "open every day" (openDays empty).
  nextAvailableDay: number | null;
}

export function getPickupAvailability(
  point: PickupAvailabilityInput,
  today: number = new Date().getDay(),
): PickupAvailability {
  if (point.enabled === false) {
    return { availableToday: false, nextAvailableDay: null };
  }
  if (point.closedOverride) {
    return { availableToday: false, nextAvailableDay: null };
  }
  if (point.openDays.length === 0) {
    return { availableToday: true, nextAvailableDay: null };
  }
  if (point.openDays.includes(today)) {
    return { availableToday: true, nextAvailableDay: null };
  }
  for (let offset = 1; offset <= 7; offset++) {
    const candidate = (today + offset) % 7;
    if (point.openDays.includes(candidate)) {
      return { availableToday: false, nextAvailableDay: candidate };
    }
  }
  // Unreachable when openDays is non-empty (the loop covers a full week),
  // kept only so the return type stays non-optional.
  return { availableToday: false, nextAvailableDay: null };
}
