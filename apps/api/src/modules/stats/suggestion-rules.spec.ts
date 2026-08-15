import {
  lowStockRule,
  noRecentOrdersRule,
  staleOrdersRule,
  topSellerRule,
} from './suggestion-rules.js';

describe('lowStockRule', () => {
  it('returns null when nothing is low on stock', () => {
    expect(lowStockRule(0)).toBeNull();
  });

  it('surfaces the count when products are low/out of stock', () => {
    expect(lowStockRule(3)).toEqual({
      id: 'low-stock',
      severity: 'warning',
      titleKey: 'lowStock',
      bodyParams: { count: 3 },
    });
  });
});

describe('staleOrdersRule', () => {
  it('returns null when no orders are stale', () => {
    expect(staleOrdersRule(0, 48)).toBeNull();
  });

  it('surfaces the count and the store hold window', () => {
    expect(staleOrdersRule(2, 48)).toEqual({
      id: 'stale-orders',
      severity: 'warning',
      titleKey: 'staleOrders',
      bodyParams: { count: 2, hours: 48 },
    });
  });
});

describe('noRecentOrdersRule', () => {
  it('returns null when there have been recent orders', () => {
    expect(noRecentOrdersRule(1, 7)).toBeNull();
  });

  it('fires when there have been no orders in the window', () => {
    expect(noRecentOrdersRule(0, 7)).toEqual({
      id: 'no-recent-orders',
      severity: 'info',
      titleKey: 'noRecentOrders',
      bodyParams: { days: 7 },
    });
  });
});

describe('topSellerRule', () => {
  it('returns null when there is no top product', () => {
    expect(topSellerRule(null, 0)).toBeNull();
  });

  it('returns null when the top product has zero units sold', () => {
    expect(topSellerRule('Widget', 0)).toBeNull();
  });

  it('surfaces the top product name and units sold', () => {
    expect(topSellerRule('Widget', 12)).toEqual({
      id: 'top-seller',
      severity: 'info',
      titleKey: 'topSeller',
      bodyParams: { name: 'Widget', count: 12 },
    });
  });
});
