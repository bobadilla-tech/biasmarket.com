import { expect, test } from "vitest";
import { limaDayInstant, limaToday } from "./lima-date";

test("noon in Lima keeps the picked day in the API's UTC view", () => {
  const now = new Date("2026-10-28T15:00:00.000Z");
  const iso = limaDayInstant("2026-10-01", now);
  expect(iso).toBe("2026-10-01T12:00:00-05:00");
  expect(new Date(iso).toISOString()).toBe("2026-10-01T17:00:00.000Z");
});

test("a date-only value would have drifted to the previous Lima day", () => {
  // Documents why the helper exists: UTC midnight is 19:00 the day before.
  const drifted = new Date("2026-10-01");
  expect(drifted.toISOString()).toBe("2026-10-01T00:00:00.000Z");
  expect(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/Lima" }).format(
      drifted,
    ),
  ).toBe("2026-09-30");
});

test("today is the Lima calendar day, not the UTC one", () => {
  // 02:00 UTC on the 29th is 21:00 on the 28th in Lima.
  expect(limaToday(new Date("2026-10-29T02:00:00.000Z"))).toBe("2026-10-28");
  expect(limaToday(new Date("2026-10-29T06:00:00.000Z"))).toBe("2026-10-29");
});

test("today before noon in Lima is the current instant, never a future noon", () => {
  // 09:00 in Lima on the 28th: noon would be three hours ahead of the API.
  const now = new Date("2026-10-28T14:00:00.000Z");
  const iso = limaDayInstant("2026-10-28", now);
  expect(iso).toBe("2026-10-28T14:00:00.000Z");
  expect(new Date(iso).getTime()).toBeLessThanOrEqual(now.getTime());
});
