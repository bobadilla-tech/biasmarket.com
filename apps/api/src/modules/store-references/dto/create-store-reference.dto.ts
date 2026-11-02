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
  @Transform(({ value }) => {
    if (value === true || value === "true") return true;
    if (value === false || value === "false") return false;
    return value;
  })
  @IsBoolean()
  hidden?: boolean;

  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === "true") return true;
    if (value === false || value === "false") return false;
    return value;
  })
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
