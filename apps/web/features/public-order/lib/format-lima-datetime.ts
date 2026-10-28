// Peru has one zone and no DST, so the buyer's own device zone is never used:
// a link opened while travelling still shows the dates the seller sees.
export const LIMA_TIME_ZONE = "America/Lima";

export function formatLimaDateTime(iso: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: LIMA_TIME_ZONE,
  }).format(new Date(iso));
}
