import type { AnalyticsRange } from './analytics.types.js';

export interface DateBucket {
  start: Date;
  end: Date;
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function dailyBuckets(count: number, now: Date): DateBucket[] {
  const today = startOfUtcDay(now);
  const buckets: DateBucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(today);
    start.setUTCDate(start.getUTCDate() - i);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 1);
    buckets.push({ start, end });
  }
  return buckets;
}

function weeklyBuckets(count: number, now: Date): DateBucket[] {
  const today = startOfUtcDay(now);
  const end0 = new Date(today);
  end0.setUTCDate(end0.getUTCDate() + 1);
  const buckets: DateBucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const end = new Date(end0);
    end.setUTCDate(end.getUTCDate() - i * 7);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 7);
    buckets.push({ start, end });
  }
  return buckets;
}

function monthlyBuckets(count: number, now: Date): DateBucket[] {
  const buckets: DateBucket[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1));
    buckets.push({ start, end });
  }
  return buckets;
}

export function buildBuckets(range: AnalyticsRange, now: Date = new Date()): DateBucket[] {
  if (range === '30d') return dailyBuckets(30, now);
  if (range === '90d') return weeklyBuckets(13, now);
  return monthlyBuckets(12, now);
}
