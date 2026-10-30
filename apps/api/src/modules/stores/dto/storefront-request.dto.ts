import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsObject, IsOptional, IsString, Matches } from "class-validator";

export class StorefrontRequestDto {
  @ApiProperty({ pattern: "^[a-z0-9][a-z0-9_-]*$" })
  @IsString()
  @Matches(/^[a-z0-9][a-z0-9_-]*$/i)
  slug!: string;
}

export class StorefrontCatalogRequestDto extends StorefrontRequestDto {
  @ApiPropertyOptional({ type: "object", additionalProperties: true })
  @IsOptional()
  @IsObject()
  query?: Record<string, unknown>;
}
