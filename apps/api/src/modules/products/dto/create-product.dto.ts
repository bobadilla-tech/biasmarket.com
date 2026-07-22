import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  IsArray,
  IsDateString,
  IsIn,
  MinLength,
} from 'class-validator';
import { SUPPORTED_CURRENCIES } from '@biasmarket/utils/currency';

export class CreateProductDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  name: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  categoryIds?: string[];

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  price: number;

  @IsOptional()
  @IsBoolean()
  soldOut?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsDateString()
  availableUntil?: string;

  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  currency?: string;
}
