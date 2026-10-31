import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsString,
  IsInt,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { Transform, Type } from "class-transformer";

export class UpdateStoreReferenceDto {
  @IsOptional()
  @Transform(({ value }) =>
    value == null ? value : value === true || value === "true",
  )
  @IsBoolean()
  hidden?: boolean;

  @IsOptional()
  @Transform(({ value }) =>
    value == null ? value : value === true || value === "true",
  )
  @IsBoolean()
  privacyConfirmed?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12000)
  @Type(() => Number)
  width?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12000)
  @Type(() => Number)
  height?: number;

  @IsOptional()
  @IsDateString({ strict: true })
  takenAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  caption?: string | null;
}
