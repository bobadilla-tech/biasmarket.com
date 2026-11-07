import { describe, expect, test } from "vitest";
import { metricsRangeFromPreset } from "./metrics-range";

const now = new Date("2026-11-07T15:00:00.000Z");

describe("metricsRangeFromPreset", () => {
  test("leaves all-time open", () => {
    expect(metricsRangeFromPreset("all", now)).toEqual({});
  });

  test("recomputes the 7-day and 30-day lower bounds from the given instant", () => {
    expect(metricsRangeFromPreset("7d", now)).toEqual({
      from: "2026-10-31T15:00:00.000Z",
    });
    expect(metricsRangeFromPreset("30d", now)).toEqual({
      from: "2026-10-08T15:00:00.000Z",
    });

    const later = new Date("2026-11-08T15:00:00.000Z");
    expect(metricsRangeFromPreset("7d", later).from).toBe(
      "2026-11-01T15:00:00.000Z",
    );
  });
});
