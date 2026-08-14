import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

// `email`/`phone` are staged (see `CustomerAuthService.updateProfile`), not
// applied immediately — a confirmation link must be clicked before either
// takes effect. `name` still applies immediately, no verification needed.
export class UpdateCustomerProfileDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  phone?: string;
}
