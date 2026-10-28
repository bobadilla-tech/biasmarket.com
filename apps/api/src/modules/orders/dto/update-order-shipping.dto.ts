import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

function trimOrNull({ value }: { value: unknown }): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed || null;
}

export class UpdateOrderShippingDto {
  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 120 })
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(120)
  trackingNumber?: string | null;

  @ApiPropertyOptional({ type: String, nullable: true, maxLength: 2048 })
  @Transform(trimOrNull)
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  trackingUrl?: string | null;
}
