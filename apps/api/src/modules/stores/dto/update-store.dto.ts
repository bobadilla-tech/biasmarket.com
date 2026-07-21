import { IsIn, IsOptional, IsString } from 'class-validator';
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
}
