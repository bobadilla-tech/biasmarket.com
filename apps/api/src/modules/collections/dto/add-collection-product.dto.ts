import { IsInt, IsOptional, IsString } from "class-validator";

export class AddCollectionProductDto {
  @IsString()
  productId: string;

  @IsOptional()
  @IsInt()
  position?: number;
}
