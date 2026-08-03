import type { Suggestion } from "./suggestions.types.js";

export function lowStockRule(lowStockCount: number): Suggestion | null {
  if (lowStockCount <= 0) return null;
  return {
    id: "low-stock",
    severity: "warning",
    titleKey: "lowStock",
    bodyParams: { count: lowStockCount },
  };
}

export function staleOrdersRule(
  staleOrderCount: number,
  holdWindowHours: number,
): Suggestion | null {
  if (staleOrderCount <= 0) return null;
  return {
    id: "stale-orders",
    severity: "warning",
    titleKey: "staleOrders",
    bodyParams: { count: staleOrderCount, hours: holdWindowHours },
  };
}

export function noRecentOrdersRule(
  recentOrderCount: number,
  windowDays: number,
): Suggestion | null {
  if (recentOrderCount > 0) return null;
  return {
    id: "no-recent-orders",
    severity: "info",
    titleKey: "noRecentOrders",
    bodyParams: { days: windowDays },
  };
}

export function topSellerRule(
  topProductName: string | null,
  unitsSold: number,
): Suggestion | null {
  if (!topProductName || unitsSold <= 0) return null;
  return {
    id: "top-seller",
    severity: "info",
    titleKey: "topSeller",
    bodyParams: { name: topProductName, count: unitsSold },
  };
}
