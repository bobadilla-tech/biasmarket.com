import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from "class-validator";

export class CourierModalityDto {
  @ApiProperty({ enum: ["AGENCY", "HOME"] })
  @IsEnum(["AGENCY", "HOME"] as const)
  modality: "AGENCY" | "HOME";

  @ApiProperty({ type: Number, description: "Price in the store's currency" })
  @IsInt()
  @Min(0)
  price: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}

export class CreateCourierDto {
  @ApiProperty({ description: "Seller-defined courier name (e.g. Olva)" })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @ApiProperty({
    type: [CourierModalityDto],
    description: "At least one modality (AGENCY or HOME)",
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CourierModalityDto)
  modalities: CourierModalityDto[];
}
