import {
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateStoreReferenceDto {
  @IsDateString()
  takenAt: string;

  @IsOptional()
  @IsString()
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
