import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateStoreReferenceDto {
  @IsOptional()
  @IsDateString()
  takenAt?: string;

  @IsOptional()
  @IsString()
  @MaxLength(240)
  caption?: string | null;
}
