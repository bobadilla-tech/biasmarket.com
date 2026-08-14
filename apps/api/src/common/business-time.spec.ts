import { expect, test } from 'vitest';
import { BUSINESS_TIME_ZONE, getBusinessDate } from './business-time.js';

test('resolves the weekday for a mid-morning instant in the business timezone', () => {
  // 2026-08-05 12:00 UTC = 07:00 in Lima, same calendar day (Wednesday).
  const result = getBusinessDate(new Date('2026-08-05T12:00:00Z'));
  expect(result).toEqual({
    year: 2026,
    month: 8,
    day: 5,
    weekday: 3,
    isoDate: '2026-08-05',
  });
});

test('just before Lima midnight still belongs to the previous business day', () => {
  // 2026-08-06 04:59 UTC = 2026-08-05 23:59 in Lima.
  const result = getBusinessDate(new Date('2026-08-06T04:59:00Z'));
  expect(result).toEqual({
    year: 2026,
    month: 8,
    day: 5,
    weekday: 3,
    isoDate: '2026-08-05',
  });
});

test('just after Lima midnight rolls over to the next business day', () => {
  // 2026-08-06 05:01 UTC = 2026-08-06 00:01 in Lima (Thursday).
  const result = getBusinessDate(new Date('2026-08-06T05:01:00Z'));
  expect(result).toEqual({
    year: 2026,
    month: 8,
    day: 6,
    weekday: 4,
    isoDate: '2026-08-06',
  });
});

test('handles month/year boundaries in the business timezone', () => {
  // 2026-01-01 04:30 UTC = 2025-12-31 23:30 in Lima.
  const result = getBusinessDate(new Date('2026-01-01T04:30:00Z'));
  expect(result).toEqual({
    year: 2025,
    month: 12,
    day: 31,
    weekday: 3,
    isoDate: '2025-12-31',
  });
});

test('exposes the documented Peru timezone constant', () => {
  expect(BUSINESS_TIME_ZONE).toBe('America/Lima');
});
