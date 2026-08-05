export const paymentRangePresetValues = [
  "today",
  "week",
  "month",
  "custom",
] as const;
export type PaymentRangePreset = (typeof paymentRangePresetValues)[number];

export interface PaymentRange {
  preset: PaymentRangePreset;
  from: string;
  to: string;
}

function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

// The range is `[from, to)` — `to` is the first instant outside the range,
// so the selected end day is included in full.
function dayAfter(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);
}

function parseDateOnly(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function resolvePaymentRange(
  preset: PaymentRangePreset,
  custom: { from?: string; to?: string },
  now: Date = new Date(),
): PaymentRange {
  const today = startOfLocalDay(now);
  const to = dayAfter(today);

  if (preset === "custom") {
    const from = custom.from
      ? startOfLocalDay(parseDateOnly(custom.from))
      : today;
    const customTo = custom.to ? dayAfter(parseDateOnly(custom.to)) : to;
    return {
      preset,
      from: from.toISOString(),
      to: customTo.toISOString(),
    };
  }

  let from: Date;
  if (preset === "today") {
    from = today;
  } else if (preset === "week") {
    const mondayOffset = (today.getDay() + 6) % 7;
    from = new Date(
      today.getFullYear(),
      today.getMonth(),
      today.getDate() - mondayOffset,
    );
  } else {
    from = new Date(today.getFullYear(), today.getMonth(), 1);
  }

  return { preset, from: from.toISOString(), to: to.toISOString() };
}
