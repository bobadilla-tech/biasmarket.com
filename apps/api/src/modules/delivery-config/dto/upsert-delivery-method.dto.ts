import { IsBoolean, IsIn, IsObject, IsOptional } from 'class-validator';

export class UpsertDeliveryMethodDto {
  @IsIn(['PICKUP', 'COURIER'])
  type: 'PICKUP' | 'COURIER';

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsObject()
  details?: Record<string, unknown>;
}
