import type { StoreResponseDto } from "./dto/store-response.dto.js";

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
  paymentInstructions: string;
  whatsappNumber: string | null;
  defaultCurrency: string;
  holdWindowHours: number;
  lowStockThreshold: number;
  lowStockAlertsEnabled: boolean;
  createdAt: Date;
}

export function toStoreDto(row: StoreRow): StoreResponseDto {
  return {
    ...row,
    themeConfig: row.themeConfig as Record<string, unknown>,
    createdAt: row.createdAt.toISOString(),
  };
}
