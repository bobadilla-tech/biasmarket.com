import { expect, test } from "vitest";
import { getPickupAvailability } from "./pickup-availability";

test("open every day when openDays is empty", () => {
  const result = getPickupAvailability(
    { openDays: [], closedOverride: false },
    3,
  );
  expect(result).toEqual({ availableToday: true, nextAvailableDay: null });
});

test("available today when today is in openDays", () => {
  const result = getPickupAvailability(
    { openDays: [1, 2, 3, 4, 5], closedOverride: false },
    3,
  );
  expect(result).toEqual({ availableToday: true, nextAvailableDay: null });
});

test("not available today, points to the next open day later this week", () => {
  // Today is Friday (5), point is only open Mon-Wed (1,2,3) -> next is
  // Monday (1) of next week.
  const result = getPickupAvailability(
    { openDays: [1, 2, 3], closedOverride: false },
    5,
  );
  expect(result).toEqual({ availableToday: false, nextAvailableDay: 1 });
});

test("not available today, next open day wraps to earlier in the week", () => {
  // Today is Saturday (6), point open only on Sunday (0) and Monday (1).
  const result = getPickupAvailability(
    { openDays: [0, 1], closedOverride: false },
    6,
  );
  expect(result).toEqual({ availableToday: false, nextAvailableDay: 0 });
});

test("closedOverride always wins, regardless of openDays", () => {
  const result = getPickupAvailability(
    { openDays: [], closedOverride: true },
    3,
  );
  expect(result).toEqual({ availableToday: false, nextAvailableDay: null });
});

test("closedOverride wins even when today is a normally-open day", () => {
  const result = getPickupAvailability(
    { openDays: [0, 1, 2, 3, 4, 5, 6], closedOverride: true },
    3,
  );
  expect(result).toEqual({ availableToday: false, nextAvailableDay: null });
});
