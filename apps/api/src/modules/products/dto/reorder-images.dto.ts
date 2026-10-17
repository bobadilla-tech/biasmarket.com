import { ApiProperty } from "@nestjs/swagger";
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsString,
} from "class-validator";
import { MAX_PRODUCT_IMAGES } from "../product-images.constants.js";

export class ReorderImagesDto {
  @ApiProperty({
    type: [String],
    description: "Exact image URLs in the desired order",
    minItems: 1,
    maxItems: MAX_PRODUCT_IMAGES,
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_PRODUCT_IMAGES)
  @IsString({ each: true })
  images!: string[];
}
