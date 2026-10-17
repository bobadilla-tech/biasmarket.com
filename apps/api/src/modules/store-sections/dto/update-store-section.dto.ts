import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
} from "class-validator";
import { StoreSectionTypeDto } from "./create-store-section.dto.js";

export class UpdateStoreSectionDto {
  @IsOptional()
  @IsEnum(StoreSectionTypeDto)
  type?: StoreSectionTypeDto;

  @IsOptional()
  @IsString()
  collectionId?: string;

  @IsOptional()
  @IsObject()
  content?: Record<string, unknown>;

  @IsOptional()
  @IsInt()
  position?: number;

  @IsOptional()
  @IsBoolean()
  hidden?: boolean;
}
