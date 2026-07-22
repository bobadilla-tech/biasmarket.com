import { IsString, IsOptional, IsInt } from 'class-validator';

export class AddCollectionProductDto {
  @IsString()
  productId: string;

  @IsOptional()
  @IsInt()
  position?: number;
}
