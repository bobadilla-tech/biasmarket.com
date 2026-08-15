// The single source of truth for "what calendar day is it right now" in the
// pickup-point availability flow. The business operates in Peru (PEN currency
// throughout this codebase), and the API container has no `TZ` env var set
// anywhere under `infra/docker/` — so the Node process's effective timezone is
// environment-dependent (UTC in most base images). Both the "is the point open
// today" check (`CreateOrderUseCase`) and the `weekday` the public pickup-points
// endpoint serves to the storefront (`PublicPickupPointsController.findEnabled`)
// must agree on the same calendar day; if one used server-local time and the
// other used UTC, a buyer/server calendar-day mismatch would let a point be
// validated against a different weekday than the one the storefront showed.
// One helper, one timezone, both call sites.
export const BUSINESS_TIME_ZONE = 'America/Lima';

export interface BusinessDate {
  // Full year, e.g. 2026.
  year: number;
  // 1-12
  month: number;
  // 1-31
  day: number;
  // JS Date.getDay() convention: 0=Sunday..6=Saturday — the same convention
  // PickupPoint.openDays stores.
  weekday: number;
  // Calendar date in the business timezone, `YYYY-MM-DD`.
  isoDate: string;
}

export function getBusinessDate(now: Date = new Date()): BusinessDate {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: BUSINESS_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = formatter.formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  const year = part('year');
  const month = part('month');
  const day = part('day');
  // A calendar date's weekday is timezone-independent once you have the y/m/d
  // — deriving it from the UTC instant of that date avoids a second
  // Intl.DateTimeFormat (there's no numeric `weekday` option).
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const isoDate = `${year}-${String(month).padStart(2, '0')}-${String(
    day,
  ).padStart(2, '0')}`;
  return { year, month, day, weekday, isoDate };
}
