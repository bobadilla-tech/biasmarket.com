import { IsEnum, IsObject, IsOptional, IsString, IsInt } from 'class-validator';

export enum StoreSectionTypeDto {
  COLLECTION = 'COLLECTION',
  BANNER = 'BANNER',
  TEXT_BLOCK = 'TEXT_BLOCK',
}

export class CreateStoreSectionDto {
  @IsEnum(StoreSectionTypeDto)
  type: StoreSectionTypeDto;

  @IsOptional()
  @IsString()
  collectionId?: string;

  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  position?: number;
}
