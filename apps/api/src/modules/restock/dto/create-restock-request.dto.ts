import { IsOptional, IsString, MinLength } from "class-validator";

export class CreateRestockRequestDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsString()
  @MinLength(6)
  phone: string;

  @IsString()
  @MinLength(1)
  productId: string;

  @IsOptional()
  @IsString()
  variantId?: string;
}
