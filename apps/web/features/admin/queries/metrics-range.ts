export type AdminMetricsPreset = "all" | "30d" | "7d";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Rolling lower bound for a dashboard preset. Called on every fetch, including
 * refresh, so a 7-day or 30-day window moves forward instead of staying frozen
 * at the moment the preset was selected.
 */
export function metricsRangeFromPreset(
  preset: AdminMetricsPreset,
  now: Date = new Date(),
): { from?: string } {
  if (preset === "7d") {
    return { from: new Date(now.getTime() - 7 * DAY_MS).toISOString() };
  }
  if (preset === "30d") {
    return { from: new Date(now.getTime() - 30 * DAY_MS).toISOString() };
  }
  return {};
}
