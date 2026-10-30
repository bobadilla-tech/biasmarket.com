import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateStoreReferenceDto {
  @IsDateString({ strict: true })
  takenAt: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  caption?: string;

  @IsInt()
  @Min(1)
  @Max(12000)
  @Type(() => Number)
  width: number;

  @IsInt()
  @Min(1)
  @Max(12000)
  @Type(() => Number)
  height: number;
}
