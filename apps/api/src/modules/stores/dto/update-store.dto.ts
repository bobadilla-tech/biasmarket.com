import { IsBoolean, IsIn, IsInt, IsObject, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { SUPPORTED_CURRENCIES } from '@biasmarket/utils/currency';

export class UpdateStoreDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  @IsOptional()
  @IsString()
  paymentInstructions?: string;

  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  defaultCurrency?: string;

  @IsOptional()
  @IsObject()
  themeConfig?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  lowStockAlertsEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;
}
