import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class BulkSaveModalityDto {
  @IsEnum(['AGENCY', 'HOME'] as const)
  modality: 'AGENCY' | 'HOME';

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class BulkSaveCourierDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  id?: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BulkSaveModalityDto)
  modalities: BulkSaveModalityDto[];
}

export class BulkSaveCouriersBodyDto {
  @ApiProperty({ type: [BulkSaveCourierDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkSaveCourierDto)
  couriers: BulkSaveCourierDto[];

  @ApiProperty({ type: [String] })
  @IsArray()
  deletedIds: string[];
}
