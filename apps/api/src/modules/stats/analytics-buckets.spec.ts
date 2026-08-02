import { buildBuckets } from './analytics-buckets.js';

describe('buildBuckets', () => {
  const now = new Date('2026-08-15T12:00:00Z');

  it('builds 30 daily buckets ending today for 30d', () => {
    const buckets = buildBuckets('30d', now);
    expect(buckets).toHaveLength(30);
    expect(buckets[29].start.toISOString()).toBe('2026-08-15T00:00:00.000Z');
    expect(buckets[29].end.toISOString()).toBe('2026-08-16T00:00:00.000Z');
    expect(buckets[0].start.toISOString()).toBe('2026-07-17T00:00:00.000Z');
  });

  it('builds 13 contiguous weekly buckets for 90d', () => {
    const buckets = buildBuckets('90d', now);
    expect(buckets).toHaveLength(13);
    for (let i = 1; i < buckets.length; i++) {
      expect(buckets[i].start.toISOString()).toBe(buckets[i - 1].end.toISOString());
    }
    expect(buckets[12].end.toISOString()).toBe('2026-08-16T00:00:00.000Z');
  });

  it('builds 12 contiguous calendar-month buckets for 12m', () => {
    const buckets = buildBuckets('12m', now);
    expect(buckets).toHaveLength(12);
    expect(buckets[11].start.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(buckets[11].end.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(buckets[0].start.toISOString()).toBe('2025-09-01T00:00:00.000Z');
  });
});
