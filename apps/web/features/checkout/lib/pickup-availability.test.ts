import { expect, test } from "vitest";
import {
  getPickupAvailability,
  nextDateForWeekday,
} from "./pickup-availability";

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

test("disabled point is never available, even when openDays says it's open today", () => {
  const result = getPickupAvailability(
    { openDays: [3], closedOverride: false, enabled: false },
    3,
  );
  expect(result).toEqual({ availableToday: false, nextAvailableDay: null });
});

// Constructed via local-time components (not a UTC ISO string) and asserted
// via local getters, matching nextDateForWeekday's own local-time semantics
// (same convention getPickupAvailability's plain weekday-integer API
// already uses) — keeps these tests correct regardless of the runner's TZ.
test("nextDateForWeekday: later this week returns the smallest positive offset", () => {
  // 2026-08-05 is a Wednesday (3); next Friday (5) is 2 days later.
  const today = new Date(2026, 7, 5, 12);
  const result = nextDateForWeekday(5, today);
  expect(result.getDate()).toBe(7);
});

test("nextDateForWeekday: wraps to next week when the weekday already passed", () => {
  // 2026-08-07 is a Friday (5); target Monday (1) is 3 days later, not -4.
  const today = new Date(2026, 7, 7, 12);
  const result = nextDateForWeekday(1, today);
  expect(result.getDate()).toBe(10);
});

test("nextDateForWeekday: same weekday as today rolls to next week, never today itself", () => {
  // 2026-08-05 is a Wednesday (3) — requesting weekday 3 back must land on
  // the following Wednesday (7 days later), not today.
  const today = new Date(2026, 7, 5, 12);
  const result = nextDateForWeekday(3, today);
  expect(result.getDate()).toBe(12);
});
