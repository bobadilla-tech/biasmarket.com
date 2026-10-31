import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { Type } from "class-transformer";
import { Transform } from "class-transformer";

export class CreateStoreReferenceDto {
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
