import { describe, expect, test } from "vitest";
import { resolvePaymentRange } from "./payment-date-ranges";

const now = new Date(2026, 7, 16, 12, 0, 0);

describe("resolvePaymentRange", () => {
  test("today covers the current local day", () => {
    const range = resolvePaymentRange("today", {}, now);

    expect(range.from).toBe(new Date(2026, 7, 16, 0, 0, 0).toISOString());
    expect(range.to).toBe(new Date(2026, 7, 17, 0, 0, 0).toISOString());
  });

  test("week starts on Monday", () => {
    const sunday = new Date(2026, 7, 16, 12, 0, 0);
    const range = resolvePaymentRange("week", {}, sunday);

    expect(range.from).toBe(new Date(2026, 7, 10, 0, 0, 0).toISOString());
    expect(range.to).toBe(new Date(2026, 7, 17, 0, 0, 0).toISOString());
  });

  test("month starts on the first of the current month", () => {
    const range = resolvePaymentRange("month", {}, now);

    expect(range.from).toBe(new Date(2026, 7, 1, 0, 0, 0).toISOString());
    expect(range.to).toBe(new Date(2026, 7, 17, 0, 0, 0).toISOString());
  });

  test("custom range is inclusive of the end day", () => {
    const range = resolvePaymentRange(
      "custom",
      { from: "2026-08-01", to: "2026-08-15" },
      now,
    );

    expect(range.from).toBe(new Date(2026, 7, 1, 0, 0, 0).toISOString());
    expect(range.to).toBe(new Date(2026, 7, 16, 0, 0, 0).toISOString());
  });

  test("custom range falls back to today when dates are missing", () => {
    const range = resolvePaymentRange("custom", {}, now);

    expect(range.from).toBe(new Date(2026, 7, 16, 0, 0, 0).toISOString());
    expect(range.to).toBe(new Date(2026, 7, 17, 0, 0, 0).toISOString());
  });
});
