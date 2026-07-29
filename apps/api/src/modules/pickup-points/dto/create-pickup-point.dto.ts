import { IsBoolean, IsInt, IsOptional, IsString, MinLength } from 'class-validator';

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
}
