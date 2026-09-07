import type { StoreResponseDto } from './dto/store-response.dto.js';

// Shared by StoresController and MyStoresController — both map a raw
// Store row to StoreResponseDto (Decimal/Date convention, see
// collections/dto/collection-response.dto.ts).
export interface StoreRow {
  id: string;
  name: string;
  slug: string;
  locale: string;
  ownerId: string;
  themeConfig: unknown;
  logoUrl: string | null;
  bio: string | null;
  aboutMarkdown: string | null;
  paymentInstructions: string;
  whatsappNumber: string | null;
  instagramUrl: string | null;
  facebookUrl: string | null;
  tiktokUrl: string | null;
  twitterUrl: string | null;
  defaultCurrency: string;
  holdWindowHours: number;
  lowStockThreshold: number;
  lowStockAlertsEnabled: boolean;
  isPublic: boolean;
  isDemo: boolean;
  createdAt: Date;
}

// Project explicitly, field by field — never `...row`. Callers pass the full
// Prisma `Store` row (which only structurally satisfies `StoreRow`), so a
// spread leaks every column that isn't on the DTO into the HTTP response.
// That's how the denormalised `publishedProductCount` / `contentStaleAt`
// bookkeeping columns started showing up on `POST /stores` and tripped the
// e2e schema assertion. Keep this a real whitelist.
export function toStoreDto(row: StoreRow): StoreResponseDto {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    locale: row.locale,
    ownerId: row.ownerId,
    themeConfig: row.themeConfig as Record<string, unknown>,
    logoUrl: row.logoUrl,
    bio: row.bio,
    aboutMarkdown: row.aboutMarkdown,
    paymentInstructions: row.paymentInstructions,
    whatsappNumber: row.whatsappNumber,
    instagramUrl: row.instagramUrl,
    facebookUrl: row.facebookUrl,
    tiktokUrl: row.tiktokUrl,
    twitterUrl: row.twitterUrl,
    defaultCurrency: row.defaultCurrency,
    holdWindowHours: row.holdWindowHours,
    lowStockThreshold: row.lowStockThreshold,
    lowStockAlertsEnabled: row.lowStockAlertsEnabled,
    isPublic: row.isPublic,
    isDemo: row.isDemo,
    createdAt: row.createdAt.toISOString(),
  };
}
