import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { MAX_PRODUCT_IMAGES } from '../product-images.constants.js';
import { SUPPORTED_CURRENCIES } from '@biasmarket/utils/currency';
import { Type } from 'class-transformer';
import { CreateVariantDto } from './create-variant.dto.js';

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
  @IsBoolean()
  discontinued?: boolean;

  // The swagger plugin only reads literal `@ArrayMaxSize` arguments, so the
  // cap is declared explicitly for the OpenAPI schema.
  @ApiPropertyOptional({ type: [String], maxItems: MAX_PRODUCT_IMAGES })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_PRODUCT_IMAGES)
  @IsString({ each: true })
  images?: string[];

  @IsOptional()
  @IsDateString()
  availableUntil?: string;

  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  currency?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateVariantDto)
  variants?: CreateVariantDto[];
}
