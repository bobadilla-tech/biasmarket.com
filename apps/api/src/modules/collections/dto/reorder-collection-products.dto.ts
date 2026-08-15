import { IsArray, IsString } from 'class-validator';

export class ReorderCollectionProductsDto {
  @IsArray()
  @IsString({ each: true })
  productIds: string[];
}
