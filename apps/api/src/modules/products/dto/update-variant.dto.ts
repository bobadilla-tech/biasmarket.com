import {
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from "class-validator";

export class UpdateVariantDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsInt()
  stock?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsNumber()
  priceOverride?: number | null;

  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsString()
  imageOverride?: string | null;

  @IsOptional()
  @IsObject()
  attributes?: Record<string, string>;
}
