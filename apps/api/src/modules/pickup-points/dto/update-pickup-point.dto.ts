import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class UpdatePickupPointDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  // `@ValidateIf` instead of `@IsOptional` for these two: `@IsOptional`
  // skips validation for `null` too, letting a `null` openDays/closedOverride
  // slip through to `PickupPoint.update()` and violate the column's NOT NULL
  // constraint as a 500 instead of a 400. `undefined` still means "don't
  // touch this field on PATCH"; `null` is rejected by the type validators
  // below.
  @ValidateIf((_, value) => value !== undefined)
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  openDays?: number[];

  @ValidateIf((_, value) => value !== undefined)
  @IsBoolean()
  closedOverride?: boolean;
}
