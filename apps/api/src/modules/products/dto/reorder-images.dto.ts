import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsString,
} from 'class-validator';

export class ReorderImagesDto {
  @ApiProperty({
    type: [String],
    description: 'Exact image URLs in the desired order',
  })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(6)
  @IsString({ each: true })
  images!: string[];
}
