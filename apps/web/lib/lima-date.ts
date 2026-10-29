// Peru has no daylight saving time: Lima is UTC-05:00 all year.
const LIMA_OFFSET = "-05:00";

/**
 * A picked calendar day as an instant: noon in Lima. A date-only string sent
 * to the API would parse as UTC midnight, which is the previous day in Lima;
 * noon keeps the same day in every zone from UTC-12 to UTC+11.
 */
export function limaNoonIso(date: string): string {
  return `${date}T12:00:00${LIMA_OFFSET}`;
}

/** Today's calendar day in Lima as YYYY-MM-DD (not the browser's zone). */
export function limaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Lima",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
