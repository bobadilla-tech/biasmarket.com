import { requiredEnv } from '../../../config/env.validation.js';

// The private link a seller sends to a buyer. The token travels in the path,
// never in a query string, so it stays out of referrers built from search
// params. Single source of truth for the buyer URL shape.
export function buildOrderAccessUrl(token: string, storeSlug: string): string {
  const base = requiredEnv('WEB_URL').replace(/\/+$/, '');
  return `${base}/es/store/${encodeURIComponent(storeSlug)}/pedido/${encodeURIComponent(token)}`;
}
