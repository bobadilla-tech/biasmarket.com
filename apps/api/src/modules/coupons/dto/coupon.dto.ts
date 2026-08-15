import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';

const PREMIUM_DURATION_DAYS = 30;

export class CreateCouponDto {
  @IsString()
  @Length(4, 8)
  @Matches(/^[A-Za-z0-9]+$/)
  code!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  plan?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => Number(value))
  durationDays?: number = PREMIUM_DURATION_DAYS;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Transform(({ value }) => Number(value))
  maxUses?: number = 1;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  isActive?: boolean;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}

export class UpdateCouponDto {
  @IsOptional()
  @IsString()
  @Length(4, 8)
  @Matches(/^[A-Za-z0-9]+$/)
  code?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  expiresAt?: string;

  @IsOptional()
  @IsBoolean()
  @Transform(({ value }) => value === true || value === 'true')
  isActive?: boolean;
}

export class RedeemCouponDto {
  @IsString()
  @IsNotEmpty()
  code!: string;
}

export class CouponResponseDto {
  id!: string;
  code!: string;
  name!: string;
  description!: string;
  plan!: string;
  durationDays!: number;
  maxUses!: number;
  isActive!: boolean;
  status!: 'active' | 'inactive' | 'expired';
  startsAt!: string | null;
  expiresAt!: string | null;
  createdAt!: string;
  updatedAt!: string;
  redemptionCount!: number;
}

export class CouponRedemptionResponseDto {
  id!: string;
  couponId!: string;
  userId!: string;
  userEmail!: string;
  userName!: string;
  storeSlug!: string | null;
  redeemedAt!: string;
  expiresAt!: string;
}
