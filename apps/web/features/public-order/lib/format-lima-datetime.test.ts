import { expect, test } from "vitest";
import { formatLimaDateTime } from "./format-lima-datetime";

// Fixed instants, not process.env.TZ: the zone is explicit in the formatter.
test("formats in America/Lima (UTC-5, no DST) whatever the device zone", () => {
  expect(formatLimaDateTime("2026-01-15T15:30:00.000Z", "es")).toContain(
    "10:30",
  );
  expect(formatLimaDateTime("2026-07-15T15:30:00.000Z", "es")).toContain(
    "10:30",
  );
});

test("crosses midnight on the Lima side, not the UTC side", () => {
  // 02:00Z on the 4th is 21:00 on the 3rd in Lima.
  const text = formatLimaDateTime("2026-09-04T02:00:00.000Z", "en");
  expect(text).toContain("Sep 3, 2026");
  expect(text).toMatch(/9:00\s?PM/);
});
