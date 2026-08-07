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

// `PickupAvailability.nextAvailableDay` is a bare weekday index (0-6), not a
// calendar date — converts it into the next real calendar date on/after
// `today`, for defaulting a date-input's value. Always returns a date
// strictly after `today` (smallest positive offset, 1-7), matching
// `getPickupAvailability`'s own "next" semantics — it never returns today's
// own weekday as "next" since a today-open point never reaches this helper.
export function nextDateForWeekday(weekday: number, today: Date): Date {
  const offset = ((weekday - today.getDay() + 7) % 7) || 7;
  const result = new Date(today);
  result.setDate(result.getDate() + offset);
  return result;
}
