import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateInquiryDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  company?: string;

  @IsOptional()
  @IsString()
  inquiryType?: string;

  @IsString()
  @MinLength(1)
  message: string;
}
