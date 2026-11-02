import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";
import { COUNTRY_CODES } from "@biasmarket/utils/countries";

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

  @IsOptional()
  @IsIn(COUNTRY_CODES)
  countryCode?: string | null;
}
