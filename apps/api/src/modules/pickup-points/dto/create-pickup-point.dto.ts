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
} from 'class-validator';

export class CreatePickupPointDto {
  @IsString()
  @MinLength(1)
  label: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsInt()
  sortOrder?: number;

  // JS Date.getDay() convention: 0=Sunday..6=Saturday. Empty/omitted = no
  // restriction, open every day.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(6, { each: true })
  openDays?: number[];

  @IsOptional()
  @IsBoolean()
  closedOverride?: boolean;
}
