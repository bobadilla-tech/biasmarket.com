import {
  IsBoolean,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  MaxLength,
  Min,
  ValidateIf,
} from "class-validator";
import { SUPPORTED_CURRENCIES } from "@biasmarket/utils/currency";
import { IsSafeMarkdown } from "../../../common/is-safe-markdown.validator.js";
import { COUNTRY_CODES } from "@biasmarket/utils/countries";
import { REGISTER_SETTINGS } from "@biasmarket/utils/register";

export class UpdateStoreDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsIn(["es", "en"])
  locale?: string;

  @IsOptional()
  @IsIn(COUNTRY_CODES)
  countryCode?: string | null;

  @IsOptional()
  @IsIn(REGISTER_SETTINGS)
  buyerRegister?: (typeof REGISTER_SETTINGS)[number];

  @IsOptional()
  @IsString()
  whatsappNumber?: string;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== "")
  @IsUrl()
  instagramUrl?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== "")
  @IsUrl()
  facebookUrl?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== "")
  @IsUrl()
  tiktokUrl?: string | null;

  @IsOptional()
  @ValidateIf((_, v) => v !== null && v !== "")
  @IsUrl()
  twitterUrl?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(280)
  bio?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  @IsSafeMarkdown()
  aboutMarkdown?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  locationLabel?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  publicOwnerName?: string | null;

  @IsOptional()
  @IsString()
  paymentInstructions?: string;

  @IsOptional()
  @IsIn(SUPPORTED_CURRENCIES)
  defaultCurrency?: string;

  @IsOptional()
  @IsObject()
  themeConfig?: Record<string, unknown>;

  @IsOptional()
  @IsBoolean()
  lowStockAlertsEnabled?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  lowStockThreshold?: number;

  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;
}
