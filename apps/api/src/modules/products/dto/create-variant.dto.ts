import {
  IsString,
  IsOptional,
  IsInt,
  IsNumber,
  MinLength,
} from 'class-validator';

export class CreateVariantDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsInt()
  stock?: number; // omitido = ilimitado/hecho a pedido

  @IsOptional()
  @IsNumber()
  priceOverride?: number;

  @IsOptional()
  @IsString()
  imageOverride?: string;
}
