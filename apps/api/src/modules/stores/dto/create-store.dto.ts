import { IsString, MinLength } from 'class-validator';

export class CreateStoreDto {
  @IsString()
  @MinLength(2)
  name: string;

  @IsString()
  slug: string;

  @IsString()
  @MinLength(6)
  whatsappNumber: string;
}
