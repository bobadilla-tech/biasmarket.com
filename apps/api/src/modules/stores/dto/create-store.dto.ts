import { IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { SUPPORTED_CURRENCIES } from '@biasmarket/utils/currency';

export class CreateStoreDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  slug: string;

  @IsString()
  @MinLength(6)
  whatsappNumber: string;

  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  defaultCurrency?: string;
}
